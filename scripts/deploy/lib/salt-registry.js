#!/usr/bin/env node
"use strict";

/**
 * Deterministic Salt Registry (spec 080, T001/T002)
 *
 * Enumerates EVERY deterministic deploy identifier in this repo by statically
 * resolving `generateSalt(...)` call sites, then reports salt collisions.
 *
 * WHY THIS IS AN AST WALK AND NOT A GREP
 * --------------------------------------
 * A name-level grep for `SALT_PREFIXES.` at the call sites returns almost
 * nothing: most call sites read a per-file LOCAL prefix variable
 * (`saltPrefix`, `saltPrefixModular`, `saltPrefixTRM`, `perpSaltPrefix`,
 * `PERP_SALT_PREFIX`, `SALT_PREFIX`, ...), and `saltPrefix` alone is assigned
 * six different values in six different files. A grep therefore reports zero
 * identifiers and zero collisions — a FALSE CLEAN RESULT. Prefixes must be
 * resolved PER FILE, per scope.
 *
 * WHAT IT RESOLVES
 * ----------------
 *  - string literals and template literals
 *  - `+` concatenation of anything else it can resolve
 *  - file-local const/let bindings (scope-chain aware)
 *  - values imported from another repo file via `require()` destructuring
 *    (this is how `SALT_PREFIXES.*` from ./constants.js is resolved — the
 *    constants module is parsed, never executed, so hardhat is never loaded)
 *  - `for (const x of <array literal>)` loop variables: the body is walked
 *    once per element, so `generateSalt(prefix + libName)` yields one entry
 *    per library, and `for (const { contract } of TARGETS)` yields one entry
 *    per target
 *  - function parameters, when the function is not exported and every call
 *    site in the same file passes the same statically-resolvable value
 *    (this is what makes `resolvePolymarketCTF(..., saltPrefix)` in deploy.js
 *    resolvable at all)
 *
 * WHAT IT REFUSES TO GUESS
 * ------------------------
 * Anything it cannot resolve is reported as UNRESOLVED with the source
 * location and the reason. Silently dropping those is the failure mode that
 * makes this whole check worthless, so they are counted and printed, and
 * `--strict` turns them into a non-zero exit.
 *
 * COLLISION vs DUPLICATE
 * ----------------------
 *  - COLLISION  : same salt, DIFFERENT contract names. A real defect — two
 *                 different contracts fight for one CREATE2 address; whichever
 *                 deploys first permanently occupies it on that chain.
 *  - DUPLICATE  : same salt, SAME contract name. Intentional idempotent
 *                 redeploy (e.g. a template deployed by both the full deploy
 *                 and a targeted resync script). Reported separately.
 *  - INDETERMINATE : same salt, and at least one entry whose contract name
 *                 could not be resolved. NOT reported as a duplicate, because
 *                 an unresolved name could be hiding a collision.
 *
 * Salt derivation mirrors `generateSalt` in ./helpers.js:
 *   ethers.id(identifier)                      // no tenant
 *   ethers.id(`tenant:${tenantId}:${ident}`)   // TENANT_ID set (spec 072)
 * helpers.js is the source of truth; `computeSalt` here must be kept in sync
 * with it (it is not imported because helpers.js loads hardhat at require
 * time, and this module has to run as a plain node script).
 *
 * CLI:
 *   node scripts/deploy/lib/salt-registry.js            # human report
 *   node scripts/deploy/lib/salt-registry.js --json     # machine readable
 *   node scripts/deploy/lib/salt-registry.js --verbose  # + every identifier
 *   node scripts/deploy/lib/salt-registry.js --strict   # unresolved => exit 1
 * Exit code is 1 when a TRUE collision exists (always), or when --strict and
 * anything is unresolved.
 */

const fs = require("fs");
const path = require("path");

let acorn;
try {
  acorn = require("acorn");
} catch (cause) {
  // Fail closed and loudly. A parser we cannot load must never degrade into
  // "zero identifiers found, no collisions".
  throw new Error(
    "salt-registry requires the 'acorn' parser and could not load it. " +
      "Run `npm run deps:reinstall` (never `npm install`). " +
      `Cause: ${cause && cause.message ? cause.message : String(cause)}`
  );
}

const { id: ethersId } = require("ethers");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

/** Directories scanned by default. `scripts/deploy` is the mandated scope; the
 *  others also call generateSalt and dropping them would under-report. */
const DEFAULT_ROOTS = ["scripts"];

/** Callee names that identify the deterministic deploy helper. */
const DEPLOY_FN_NAMES = new Set(["deployDeterministic"]);

/** Callees whose first argument names a contract, used as a fallback when the
 *  salt never reaches deployDeterministic (predict-only / preflight scripts). */
const ARTIFACT_FN_NAMES = new Set(["readArtifact", "getContractFactory"]);

// =============================================================================
// SALT DERIVATION (mirrors helpers.js — keep in sync)
// =============================================================================

/**
 * Resolve the active tenant id the same way helpers.js#activeTenantId does.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function normalizeTenantId(raw) {
  const value = (raw || "").trim();
  if (!value || value === "fairwins") return null;
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(value)) {
    throw new Error(`TENANT_ID "${value}" is invalid — must match ^[a-z][a-z0-9-]{1,30}$`);
  }
  return value;
}

/**
 * Compute the CREATE2 salt for an identifier exactly as helpers.js#generateSalt does.
 * @param {string} identifier
 * @param {string|null} [tenantId]
 * @returns {string} 32-byte hex salt
 */
function computeSalt(identifier, tenantId = null) {
  return ethersId(tenantId ? `tenant:${tenantId}:${identifier}` : identifier);
}

// =============================================================================
// STATIC VALUE MODEL
// =============================================================================

const UNKNOWN = (reason) => ({ kind: "unknown", reason });
const STR = (value) => ({ kind: "string", value });
const ARR = (items) => ({ kind: "array", items });
const OBJ = (props) => ({ kind: "object", props });

class Scope {
  constructor(parent) {
    this.parent = parent || null;
    this.vars = new Map();
    /** salt-variable name -> contract name, recorded from deployDeterministic call sites */
    this.deployNameByVar = new Map();
    /** contract names seen via readArtifact()/getContractFactory() in this scope */
    this.artifactNames = [];
  }

  define(name, value) {
    this.vars.set(name, value);
  }

  lookup(name) {
    for (let s = this; s; s = s.parent) {
      if (s.vars.has(name)) return s.vars.get(name);
    }
    return undefined;
  }

  declaringScope(name) {
    for (let s = this; s; s = s.parent) {
      if (s.vars.has(name)) return s;
    }
    return null;
  }
}

// =============================================================================
// AST HELPERS
// =============================================================================

const SKIP_KEYS = new Set(["type", "start", "end", "loc", "range", "raw"]);

function childNodes(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") out.push(item);
    } else if (value && typeof value.type === "string") {
      out.push(value);
    }
  }
  return out;
}

function walkAll(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of childNodes(node)) walkAll(child, visit);
}

function describeCallee(callee) {
  if (!callee) return "<anonymous>";
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) {
    return `${describeCallee(callee.object)}.${callee.property.name || "?"}`;
  }
  return callee.type;
}

function calleeName(callee) {
  if (!callee) return null;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
    return callee.property.name;
  }
  return null;
}

function parseFile(absPath) {
  const source = fs.readFileSync(absPath, "utf8");
  const options = { ecmaVersion: "latest", locations: true, allowHashBang: true, allowReturnOutsideFunction: true };
  let ast;
  try {
    ast = acorn.parse(source, { ...options, sourceType: "script" });
  } catch {
    // A handful of tools in this tree may be ESM; try again before giving up.
    ast = acorn.parse(source, { ...options, sourceType: "module" });
  }
  return { ast, source };
}

// =============================================================================
// MODULE BINDING RESOLUTION (require(...) of another repo file)
// =============================================================================

/**
 * Parse a repo file and evaluate only its top-level declarations, so a
 * `require()` of it can be resolved to an object of statically-known values.
 * The target module is never executed.
 */
function loadModuleExports(absPath, ctx) {
  if (ctx.moduleCache.has(absPath)) return ctx.moduleCache.get(absPath);
  if (ctx.moduleLoading.has(absPath)) return UNKNOWN(`circular require of ${path.relative(REPO_ROOT, absPath)}`);

  ctx.moduleLoading.add(absPath);
  let result;
  try {
    const { ast } = parseFile(absPath);
    const scope = new Scope(null);
    const subCtx = {
      ...ctx,
      file: absPath,
      rel: path.relative(REPO_ROOT, absPath),
      dir: path.dirname(absPath),
    };
    for (const stmt of ast.body) {
      if (stmt.type !== "VariableDeclaration") continue;
      for (const decl of stmt.declarations) {
        bindPattern(decl.id, decl.init ? evaluate(decl.init, scope, subCtx) : UNKNOWN("no initializer"), scope);
      }
    }
    result = OBJ(scope.vars);
  } catch (error) {
    result = UNKNOWN(`failed to parse ${path.relative(REPO_ROOT, absPath)}: ${error.message}`);
  } finally {
    ctx.moduleLoading.delete(absPath);
  }

  ctx.moduleCache.set(absPath, result);
  return result;
}

function resolveRequire(node, ctx) {
  const spec = node.arguments[0].value;
  if (!spec.startsWith(".")) return UNKNOWN(`require("${spec}") — not a repo-local module`);
  const base = path.resolve(ctx.dir, spec);
  const candidates = [base, `${base}.js`, path.join(base, "index.js")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return loadModuleExports(candidate, ctx);
    }
  }

  // The literal path does not exist — the requiring script is broken and would
  // throw MODULE_NOT_FOUND if run (this is the case for the archived numbered
  // deploy scripts, which were moved into archive/ without fixing "./lib/...").
  // Refusing to look further would drop ~30 historical identifiers from the
  // registry, which is the silent-under-report failure this check exists to
  // prevent. So fall back to a UNIQUE same-tail file under the scanned roots,
  // and record every use of the fallback so it is visible in the report.
  const tail = spec.replace(/^(\.\.?\/)+/, "");
  const suffixes = [`${path.sep}${tail}.js`, `${path.sep}${tail}${path.sep}index.js`, `${path.sep}${tail}`];
  const matches = ctx.fileIndex.filter((file) => suffixes.some((suffix) => file.endsWith(suffix)));
  const unique = [...new Set(matches)];
  if (unique.length === 1) {
    ctx.moduleFallbacks.push({
      sourceFile: ctx.rel,
      specifier: spec,
      brokenPath: path.relative(REPO_ROOT, base),
      resolvedTo: path.relative(REPO_ROOT, unique[0]),
    });
    return loadModuleExports(unique[0], ctx);
  }

  return UNKNOWN(
    `require("${spec}") — path does not exist and ${unique.length === 0 ? "no" : `${unique.length} ambiguous`} fallback found`
  );
}

function isRequireCall(node) {
  return (
    node.callee.type === "Identifier" &&
    node.callee.name === "require" &&
    node.arguments.length === 1 &&
    node.arguments[0].type === "Literal" &&
    typeof node.arguments[0].value === "string"
  );
}

// =============================================================================
// EVALUATOR
// =============================================================================

function memberReason(node, object) {
  const inner = object.reason || `member access on ${object.kind}`;
  // Only name the access path at the innermost failure, so a nested member
  // chain reports `process.env: unbound identifier "process"` once rather than
  // repeating the path at every level.
  return node.object.type === "Identifier" ? `${describeCallee(node)}: ${inner}` : inner;
}

function evaluate(node, scope, ctx) {
  if (!node) return UNKNOWN("missing expression");

  switch (node.type) {
    case "Literal": {
      if (typeof node.value === "string") return STR(node.value);
      if (typeof node.value === "number" || typeof node.value === "boolean") return STR(String(node.value));
      return UNKNOWN(`literal of type ${node.value === null ? "null" : typeof node.value}`);
    }

    case "TemplateLiteral": {
      let out = "";
      for (let i = 0; i < node.quasis.length; i += 1) {
        out += node.quasis[i].value.cooked ?? "";
        if (i < node.expressions.length) {
          const part = evaluate(node.expressions[i], scope, ctx);
          if (part.kind !== "string") return UNKNOWN(`template placeholder: ${part.reason || part.kind}`);
          out += part.value;
        }
      }
      return STR(out);
    }

    case "BinaryExpression": {
      if (node.operator !== "+") return UNKNOWN(`unsupported operator "${node.operator}"`);
      const left = evaluate(node.left, scope, ctx);
      if (left.kind !== "string") return UNKNOWN(left.reason || `left operand is ${left.kind}`);
      const right = evaluate(node.right, scope, ctx);
      if (right.kind !== "string") return UNKNOWN(right.reason || `right operand is ${right.kind}`);
      return STR(left.value + right.value);
    }

    case "Identifier": {
      const found = scope.lookup(node.name);
      if (found === undefined) return UNKNOWN(`unbound identifier "${node.name}"`);
      return found;
    }

    case "MemberExpression": {
      const object = evaluate(node.object, scope, ctx);
      if (node.computed) {
        const key = evaluate(node.property, scope, ctx);
        if (key.kind !== "string") return UNKNOWN(`computed member key: ${key.reason || key.kind}`);
        if (object.kind === "object") {
          return object.props.has(key.value)
            ? object.props.get(key.value)
            : UNKNOWN(`property "${key.value}" not statically known`);
        }
        if (object.kind === "array") {
          const index = Number(key.value);
          if (Number.isInteger(index) && index >= 0 && index < object.items.length) return object.items[index];
          return UNKNOWN(`array index ${key.value} out of static range`);
        }
        return UNKNOWN(memberReason(node, object));
      }
      const name = node.property.name;
      if (object.kind === "object") {
        return object.props.has(name) ? object.props.get(name) : UNKNOWN(`property "${name}" not statically known`);
      }
      return UNKNOWN(memberReason(node, object));
    }

    case "ObjectExpression": {
      const props = new Map();
      for (const prop of node.properties) {
        if (prop.type !== "Property" || prop.computed) continue;
        const key =
          prop.key.type === "Identifier"
            ? prop.key.name
            : prop.key.type === "Literal"
              ? String(prop.key.value)
              : null;
        if (key === null) continue;
        props.set(key, evaluate(prop.value, scope, ctx));
      }
      return OBJ(props);
    }

    case "ArrayExpression":
      return ARR(node.elements.map((el) => (el ? evaluate(el, scope, ctx) : UNKNOWN("hole in array literal"))));

    case "CallExpression":
      if (isRequireCall(node)) return resolveRequire(node, ctx);
      return UNKNOWN(`return value of ${describeCallee(node.callee)}()`);

    case "AwaitExpression":
      return UNKNOWN(`awaited ${node.argument ? node.argument.type : "expression"}`);

    case "LogicalExpression":
      return UNKNOWN(`logical "${node.operator}" expression`);

    case "ConditionalExpression":
      return UNKNOWN("conditional expression");

    case "TSAsExpression":
    case "ParenthesizedExpression":
      return evaluate(node.expression, scope, ctx);

    default:
      return UNKNOWN(`unsupported expression node ${node.type}`);
  }
}

function bindPattern(pattern, value, scope) {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      scope.define(pattern.name, value);
      return;

    case "AssignmentPattern":
      bindPattern(pattern.left, value, scope);
      return;

    case "ObjectPattern": {
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") {
          bindPattern(prop.argument, UNKNOWN("object rest element"), scope);
          continue;
        }
        if (prop.computed) {
          bindPattern(prop.value, UNKNOWN("computed destructuring key"), scope);
          continue;
        }
        const key =
          prop.key.type === "Identifier"
            ? prop.key.name
            : prop.key.type === "Literal"
              ? String(prop.key.value)
              : null;
        let sub;
        if (key === null) {
          sub = UNKNOWN("non-static destructuring key");
        } else if (value && value.kind === "object") {
          sub = value.props.has(key) ? value.props.get(key) : UNKNOWN(`property "${key}" not statically known`);
        } else {
          sub = UNKNOWN(`destructuring "${key}" from ${value ? value.reason || value.kind : "nothing"}`);
        }
        bindPattern(prop.value, sub, scope);
      }
      return;
    }

    case "ArrayPattern": {
      pattern.elements.forEach((element, index) => {
        if (!element) return;
        if (element.type === "RestElement") {
          bindPattern(element.argument, UNKNOWN("array rest element"), scope);
          return;
        }
        let sub;
        if (value && value.kind === "array" && index < value.items.length) sub = value.items[index];
        else sub = UNKNOWN(`array element ${index} of ${value ? value.reason || value.kind : "nothing"}`);
        bindPattern(element, sub, scope);
      });
      return;
    }

    default:
      // Unsupported pattern: nothing gets bound, so downstream reads report
      // "unbound identifier" rather than a wrong value.
  }
}

// =============================================================================
// SCANNER
// =============================================================================

function hoistFunctionDeclarations(body, ctx) {
  for (const stmt of body) {
    if (stmt.type === "FunctionDeclaration" && stmt.id && stmt.id.type === "Identifier") {
      if (!ctx.functionsByName.has(stmt.id.name)) ctx.functionsByName.set(stmt.id.name, stmt);
    }
  }
}

/**
 * Bind the parameters of a top-level function declaration from its call sites.
 * Only safe when the function cannot be called from outside this file and every
 * in-file call site agrees; otherwise the parameter stays unknown.
 */
function inferParams(fnNode, fnName, scope, ctx) {
  if (!fnName) return fnNode.params.map(() => UNKNOWN("parameter of an anonymous function"));
  if (ctx.exportedNames.has(fnName)) {
    return fnNode.params.map(() => UNKNOWN(`parameter of exported function ${fnName}() — external callers unknown`));
  }

  const callSites = [];
  walkAll(ctx.ast, (node) => {
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === fnName) {
      callSites.push(node);
    }
  });
  if (callSites.length === 0) {
    return fnNode.params.map(() => UNKNOWN(`parameter of ${fnName}() — no call site found in this file`));
  }

  return fnNode.params.map((param, index) => {
    if (param.type !== "Identifier") return UNKNOWN("non-identifier parameter");
    const values = new Set();
    for (const call of callSites) {
      const arg = call.arguments[index];
      if (!arg) return UNKNOWN(`${fnName}() called with fewer than ${index + 1} arguments`);
      const value = evaluate(arg, ctx.programScope, ctx);
      if (value.kind !== "string") return UNKNOWN(`${fnName}() argument ${index}: ${value.reason || value.kind}`);
      values.add(value.value);
    }
    if (values.size !== 1) {
      return UNKNOWN(`${fnName}() argument ${index} differs across call sites (${[...values].join(", ")})`);
    }
    return STR([...values][0]);
  });
}

function scanFunction(node, scope, ctx, fnName) {
  const inner = new Scope(scope);
  const bound = inferParams(node, fnName, scope, ctx);
  node.params.forEach((param, index) => {
    bindPattern(param, bound[index] || UNKNOWN("unbound parameter"), inner);
  });
  if (node.body.type === "BlockStatement") {
    hoistFunctionDeclarations(node.body.body, ctx);
    scanStatements(node.body.body, inner, ctx);
  } else {
    scanNode(node.body, inner, ctx);
  }
}

function scanStatements(body, scope, ctx) {
  for (const stmt of body) scanNode(stmt, scope, ctx);
}

function recordArtifactName(node, scope, ctx) {
  if (node.arguments.length === 0) return;
  const value = evaluate(node.arguments[0], scope, ctx);
  if (value.kind === "string") scope.artifactNames.push(value.value);
}

function recordDeployCall(node, scope, ctx) {
  const nameValue = node.arguments.length > 0 ? evaluate(node.arguments[0], scope, ctx) : UNKNOWN("no arguments");
  const contractName = nameValue.kind === "string" ? nameValue.value : null;

  // deployDeterministic(name, args, salt, ...): when the salt arrives as a
  // variable, remember which contract that variable ends up deploying so an
  // earlier `const salt = generateSalt(...)` can be attributed to it.
  const saltArg = node.arguments[2];
  if (contractName && saltArg && saltArg.type === "Identifier") {
    const target = scope.declaringScope(saltArg.name) || scope;
    target.deployNameByVar.set(saltArg.name, contractName);
  }
  return contractName;
}

function recordSaltCall(node, scope, ctx) {
  const line = node.loc ? node.loc.start.line : 0;
  const expression = ctx.source.slice(node.start, node.end).replace(/\s+/g, " ");
  const argNode = node.arguments[0];
  const value = argNode ? evaluate(argNode, scope, ctx) : UNKNOWN("generateSalt() called with no argument");

  if (value.kind !== "string") {
    ctx.unresolved.push({
      sourceFile: ctx.rel,
      line,
      expression,
      reason: value.reason || `identifier is ${value.kind}`,
    });
    return;
  }

  const stackTop = ctx.contractNameStack.length
    ? ctx.contractNameStack[ctx.contractNameStack.length - 1]
    : null;

  ctx.entries.push({
    identifier: value.value,
    salt: computeSalt(value.value, ctx.tenantId),
    contractName: stackTop || null,
    contractNameSource: stackTop ? "deployDeterministic-arg" : null,
    sourceFile: ctx.rel,
    line,
    expression,
    // internal, stripped before the result is returned
    _scope: scope,
    _saltVar: ctx.pendingSaltVar,
  });
}

function scanNode(node, scope, ctx) {
  if (!node) return;

  switch (node.type) {
    case "VariableDeclaration": {
      for (const decl of node.declarations) {
        const previous = ctx.pendingSaltVar;
        ctx.pendingSaltVar = decl.id && decl.id.type === "Identifier" ? decl.id.name : null;
        if (decl.init) scanNode(decl.init, scope, ctx);
        ctx.pendingSaltVar = previous;
        bindPattern(decl.id, decl.init ? evaluate(decl.init, scope, ctx) : UNKNOWN("no initializer"), scope);
      }
      return;
    }

    case "BlockStatement": {
      const inner = new Scope(scope);
      hoistFunctionDeclarations(node.body, ctx);
      scanStatements(node.body, inner, ctx);
      return;
    }

    case "ForOfStatement":
    case "ForInStatement": {
      scanNode(node.right, scope, ctx);
      const iterable = node.type === "ForOfStatement" ? evaluate(node.right, scope, ctx) : UNKNOWN("for-in keys");
      const pattern = node.left.type === "VariableDeclaration" ? node.left.declarations[0].id : node.left;

      if (iterable.kind === "array" && iterable.items.length > 0) {
        // Walk the body once per element so each iteration produces its own
        // identifier — this is what turns `for (const { contract } of TARGETS)`
        // into one real entry per target instead of one unresolved blob.
        for (const item of iterable.items) {
          const inner = new Scope(scope);
          bindPattern(pattern, item, inner);
          scanNode(node.body, inner, ctx);
        }
        return;
      }

      const inner = new Scope(scope);
      bindPattern(pattern, UNKNOWN(iterable.reason || "loop over a non-literal iterable"), inner);
      scanNode(node.body, inner, ctx);
      return;
    }

    case "FunctionDeclaration":
      scanFunction(node, scope, ctx, node.id ? node.id.name : null);
      return;

    case "FunctionExpression":
    case "ArrowFunctionExpression":
      scanFunction(node, scope, ctx, null);
      return;

    case "CallExpression": {
      const name = calleeName(node.callee);

      if (node.callee.type === "Identifier" && node.callee.name === "generateSalt") {
        recordSaltCall(node, scope, ctx);
        // Do not descend: the only child of interest is the identifier
        // expression, already evaluated above.
        return;
      }

      if (name && ARTIFACT_FN_NAMES.has(name)) recordArtifactName(node, scope, ctx);

      if (node.callee.type === "Identifier" && DEPLOY_FN_NAMES.has(node.callee.name)) {
        const contractName = recordDeployCall(node, scope, ctx);
        ctx.contractNameStack.push(contractName);
        for (const arg of node.arguments) scanNode(arg, scope, ctx);
        ctx.contractNameStack.pop();
        return;
      }

      for (const child of childNodes(node)) scanNode(child, scope, ctx);
      return;
    }

    default: {
      for (const child of childNodes(node)) scanNode(child, scope, ctx);
    }
  }
}

function collectExportedNames(ast) {
  const names = new Set();
  walkAll(ast, (node) => {
    if (node.type !== "AssignmentExpression") return;
    const target = node.left;
    const isExportsTarget =
      target.type === "MemberExpression" &&
      ((target.object.type === "Identifier" && target.object.name === "exports") ||
        (target.object.type === "MemberExpression" &&
          target.object.object.type === "Identifier" &&
          target.object.object.name === "module") ||
        (target.object.type === "Identifier" && target.object.name === "module"));
    if (!isExportsTarget) return;
    walkAll(node.right, (child) => {
      if (child.type === "Identifier") names.add(child.name);
    });
  });
  return names;
}

// =============================================================================
// CONTRACT-NAME RESOLUTION (post-scan)
// =============================================================================

function resolveContractNames(entries) {
  for (const entry of entries) {
    if (entry.contractName) continue;

    // 1. `const salt = generateSalt(...)` later handed to deployDeterministic.
    if (entry._saltVar) {
      for (let s = entry._scope; s; s = s.parent) {
        if (s.deployNameByVar.has(entry._saltVar)) {
          entry.contractName = s.deployNameByVar.get(entry._saltVar);
          entry.contractNameSource = "deployDeterministic-var";
          break;
        }
      }
      if (entry.contractName) continue;
    }

    // 2. Nearest enclosing scope that names a contract via readArtifact() or
    //    getContractFactory(). Only usable when that scope names exactly one.
    for (let s = entry._scope; s; s = s.parent) {
      if (s.artifactNames.length === 0) continue;
      const distinct = [...new Set(s.artifactNames)];
      if (distinct.length === 1) {
        entry.contractName = distinct[0];
        entry.contractNameSource = "artifact-lookup";
      } else {
        entry.contractNameSource = "unresolved";
        entry.contractNameReason = `${distinct.length} candidate contract names in scope (${distinct.join(", ")})`;
      }
      break;
    }

    if (!entry.contractName) {
      entry.contractNameSource = "unresolved";
      if (!entry.contractNameReason) {
        entry.contractNameReason = entry._saltVar
          ? `salt variable "${entry._saltVar}" never reaches deployDeterministic() in this file`
          : "generateSalt() result is not an argument to deployDeterministic()";
      }
    }
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

function listJsFiles(absDir, out) {
  for (const dirent of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (dirent.name === "node_modules" || dirent.name.startsWith(".")) continue;
    const full = path.join(absDir, dirent.name);
    if (dirent.isDirectory()) listJsFiles(full, out);
    else if (dirent.isFile() && full.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * Build the full deterministic-salt registry.
 *
 * @param {Object} [options]
 * @param {string[]} [options.roots] - repo-relative directories to scan
 * @param {string} [options.cwd] - repo root (defaults to this repo)
 * @param {string|null} [options.tenantId] - tenant scope; defaults to TENANT_ID
 * @returns {{
 *   tenantId: string|null,
 *   roots: string[],
 *   filesScanned: number,
 *   entries: Array<{identifier:string,salt:string,contractName:string|null,contractNameSource:string,sourceFile:string,line:number,expression:string}>,
 *   unresolved: Array<{sourceFile:string,line:number,expression:string,reason:string}>,
 *   unresolvedContractNames: Array<Object>,
 *   duplicates: Array<Object>,
 *   collisions: Array<Object>,
 *   indeterminate: Array<Object>,
 *   stats: Object
 * }}
 */
function buildSaltRegistry(options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const roots = options.roots || DEFAULT_ROOTS;
  const tenantId =
    options.tenantId !== undefined ? normalizeTenantId(options.tenantId) : normalizeTenantId(process.env.TENANT_ID);

  const files = [];
  for (const root of roots) {
    const absRoot = path.resolve(cwd, root);
    if (!fs.existsSync(absRoot)) continue;
    if (fs.statSync(absRoot).isDirectory()) listJsFiles(absRoot, files);
    else files.push(absRoot);
  }
  files.sort();

  const moduleCache = new Map();
  const moduleLoading = new Set();
  const moduleFallbacks = [];
  const entries = [];
  const unresolved = [];
  const parseFailures = [];

  for (const file of files) {
    const rel = path.relative(cwd, file);
    let parsed;
    try {
      parsed = parseFile(file);
    } catch (error) {
      parseFailures.push({ sourceFile: rel, reason: error.message });
      continue;
    }
    // Cheap pre-filter: files that never mention generateSalt cannot contribute
    // an identifier. They are still parseable as require() targets on demand.
    if (!parsed.source.includes("generateSalt")) continue;

    const programScope = new Scope(null);
    const ctx = {
      file,
      rel,
      dir: path.dirname(file),
      source: parsed.source,
      ast: parsed.ast,
      tenantId,
      entries,
      unresolved,
      moduleCache,
      moduleLoading,
      moduleFallbacks,
      fileIndex: files,
      functionsByName: new Map(),
      exportedNames: collectExportedNames(parsed.ast),
      contractNameStack: [],
      pendingSaltVar: null,
      programScope,
    };
    hoistFunctionDeclarations(parsed.ast.body, ctx);
    scanStatements(parsed.ast.body, programScope, ctx);
  }

  resolveContractNames(entries);

  // ---- grouping -----------------------------------------------------------
  const bySalt = new Map();
  for (const entry of entries) {
    if (!bySalt.has(entry.salt)) bySalt.set(entry.salt, []);
    bySalt.get(entry.salt).push(entry);
  }

  const collisions = [];
  const duplicates = [];
  const indeterminate = [];

  for (const [salt, group] of bySalt) {
    if (group.length < 2) continue;
    const names = new Set(group.filter((e) => e.contractName).map((e) => e.contractName));
    const anyUnknown = group.some((e) => !e.contractName);
    const summary = {
      salt,
      identifier: group[0].identifier,
      contractNames: [...names],
      occurrences: group.map((e) => ({
        sourceFile: e.sourceFile,
        line: e.line,
        contractName: e.contractName,
        contractNameSource: e.contractNameSource,
      })),
    };
    if (names.size > 1) collisions.push(summary);
    else if (anyUnknown) {
      indeterminate.push({
        ...summary,
        reason: "at least one occurrence has an unresolved contract name — cannot confirm it is the same contract",
      });
    } else duplicates.push(summary);
  }

  const unresolvedContractNames = entries
    .filter((e) => !e.contractName)
    .map((e) => ({
      identifier: e.identifier,
      salt: e.salt,
      sourceFile: e.sourceFile,
      line: e.line,
      reason: e.contractNameReason || "unknown",
    }));

  const clean = entries.map((e) => ({
    identifier: e.identifier,
    salt: e.salt,
    contractName: e.contractName,
    contractNameSource: e.contractNameSource,
    sourceFile: e.sourceFile,
    line: e.line,
    expression: e.expression,
    ...(e.contractNameReason ? { contractNameReason: e.contractNameReason } : {}),
  }));
  clean.sort(
    (a, b) => a.identifier.localeCompare(b.identifier) || a.sourceFile.localeCompare(b.sourceFile) || a.line - b.line
  );

  return {
    tenantId,
    roots,
    filesScanned: files.length,
    entries: clean,
    unresolved,
    unresolvedContractNames,
    parseFailures,
    moduleFallbacks,
    duplicates,
    collisions,
    indeterminate,
    stats: {
      identifiers: clean.length,
      uniqueIdentifiers: new Set(clean.map((e) => e.identifier)).size,
      uniqueSalts: bySalt.size,
      unresolvedIdentifiers: unresolved.length,
      unresolvedContractNames: unresolvedContractNames.length,
      sameContractDuplicates: duplicates.length,
      trueCollisions: collisions.length,
      indeterminateGroups: indeterminate.length,
      parseFailures: parseFailures.length,
      brokenRequirePaths: new Set(moduleFallbacks.map((f) => `${f.sourceFile}:${f.specifier}`)).size,
    },
  };
}

// =============================================================================
// REPORT
// =============================================================================

function formatReport(registry, { verbose = false } = {}) {
  const lines = [];
  const s = registry.stats;

  lines.push("Deterministic salt registry (spec 080)");
  lines.push("=".repeat(72));
  lines.push(`Roots            : ${registry.roots.join(", ")}`);
  lines.push(`Files scanned    : ${registry.filesScanned}`);
  lines.push(`Tenant scope     : ${registry.tenantId ? registry.tenantId : "(none — shared estate, unprefixed salts)"}`);
  lines.push("");
  lines.push(`Identifiers resolved       : ${s.identifiers} (${s.uniqueIdentifiers} unique, ${s.uniqueSalts} unique salts)`);
  lines.push(`Unresolved identifiers     : ${s.unresolvedIdentifiers}`);
  lines.push(`Unresolved contract names  : ${s.unresolvedContractNames}`);
  lines.push(`Same-contract duplicates   : ${s.sameContractDuplicates}`);
  lines.push(`Indeterminate salt groups  : ${s.indeterminateGroups}`);
  lines.push(`TRUE COLLISIONS            : ${s.trueCollisions}`);
  if (s.parseFailures) lines.push(`Parse failures             : ${s.parseFailures}`);
  if (s.brokenRequirePaths) lines.push(`Broken require() paths     : ${s.brokenRequirePaths}`);
  lines.push("");

  if (verbose) {
    lines.push("-".repeat(72));
    lines.push("All resolved identifiers");
    lines.push("-".repeat(72));
    for (const e of registry.entries) {
      lines.push(
        `  ${e.salt.slice(0, 10)}…  ${e.identifier}` +
          `\n      contract: ${e.contractName || "<unresolved>"} [${e.contractNameSource}]` +
          `\n      at      : ${e.sourceFile}:${e.line}`
      );
    }
    lines.push("");
  }

  if (registry.unresolved.length) {
    lines.push("-".repeat(72));
    lines.push(`UNRESOLVED generateSalt() call sites (${registry.unresolved.length})`);
    lines.push("  These identifiers could not be computed statically. They are NOT in the");
    lines.push("  registry above, so any collision involving them is invisible to this check.");
    lines.push("-".repeat(72));
    for (const u of registry.unresolved) {
      lines.push(`  ${u.sourceFile}:${u.line}`);
      lines.push(`      ${u.expression}`);
      lines.push(`      reason: ${u.reason}`);
    }
    lines.push("");
  }

  if (registry.unresolvedContractNames.length) {
    lines.push("-".repeat(72));
    lines.push(`Identifiers with an UNRESOLVED contract name (${registry.unresolvedContractNames.length})`);
    lines.push("  The salt is known; what deploys to it is not.");
    lines.push("-".repeat(72));
    for (const u of registry.unresolvedContractNames) {
      lines.push(`  ${u.identifier}`);
      lines.push(`      at    : ${u.sourceFile}:${u.line}`);
      lines.push(`      reason: ${u.reason}`);
    }
    lines.push("");
  }

  if (registry.collisions.length) {
    lines.push("=".repeat(72));
    lines.push(`TRUE COLLISIONS (${registry.collisions.length}) — same salt, different contracts`);
    lines.push("=".repeat(72));
    for (const c of registry.collisions) {
      lines.push(`  identifier: ${c.identifier}`);
      lines.push(`  salt      : ${c.salt}`);
      lines.push(`  contracts : ${c.contractNames.join(" vs ")}`);
      for (const o of c.occurrences) {
        lines.push(`      ${o.sourceFile}:${o.line} -> ${o.contractName || "<unresolved>"}`);
      }
      lines.push("");
    }
  } else {
    lines.push("No true collisions: every salt claimed by more than one call site names the same contract.");
    lines.push("");
  }

  if (registry.indeterminate.length) {
    lines.push("-".repeat(72));
    lines.push(`INDETERMINATE salt groups (${registry.indeterminate.length}) — needs a human`);
    lines.push("-".repeat(72));
    for (const g of registry.indeterminate) {
      lines.push(`  ${g.identifier}  [${g.salt.slice(0, 10)}…]`);
      for (const o of g.occurrences) {
        lines.push(`      ${o.sourceFile}:${o.line} -> ${o.contractName || "<unresolved>"}`);
      }
    }
    lines.push("");
  }

  if (registry.duplicates.length) {
    lines.push("-".repeat(72));
    lines.push(`Same-contract duplicates (${registry.duplicates.length}) — intentional idempotent redeploys`);
    lines.push("-".repeat(72));
    for (const d of registry.duplicates) {
      lines.push(`  ${d.contractNames[0]} <- ${d.identifier}`);
      for (const o of d.occurrences) lines.push(`      ${o.sourceFile}:${o.line}`);
    }
    lines.push("");
  }

  if (registry.moduleFallbacks.length) {
    const seen = new Set();
    lines.push("-".repeat(72));
    lines.push("BROKEN require() PATHS resolved by fallback");
    lines.push("  The requiring script would throw MODULE_NOT_FOUND if it were run. Its");
    lines.push("  identifiers are in the registry above only because a unique same-tail file");
    lines.push("  was found; fix the path or delete the script.");
    lines.push("-".repeat(72));
    for (const f of registry.moduleFallbacks) {
      const key = `${f.sourceFile}|${f.specifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${f.sourceFile}: require("${f.specifier}") -> missing ${f.brokenPath}.js`);
      lines.push(`      read instead: ${f.resolvedTo}`);
    }
    lines.push("");
  }

  if (registry.parseFailures.length) {
    lines.push("=".repeat(72));
    lines.push(`PARSE FAILURES (${registry.parseFailures.length}) — files that could not be analysed at all`);
    lines.push("  Every generateSalt() call in these files is INVISIBLE to this check.");
    lines.push("=".repeat(72));
    for (const f of registry.parseFailures) lines.push(`  ${f.sourceFile}: ${f.reason}`);
    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// CLI
// =============================================================================

function main(argv) {
  const args = new Set(argv.slice(2));
  const registry = buildSaltRegistry();

  if (args.has("--json")) {
    process.stdout.write(`${JSON.stringify(registry, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(registry, { verbose: args.has("--verbose") })}\n`);
  }

  if (registry.collisions.length > 0) return 1;

  /*
   * INDETERMINATE GROUPS FAIL CLOSED — by default, not only under --strict.
   *
   * An indeterminate group is two or more call sites sharing one salt where at least one contract
   * name could not be resolved. That is not "probably fine": it is a POSSIBLE collision between two
   * different contracts, which is the exact defect this gate exists to find.
   *
   * Found adversarially: a fixture with two genuinely different contracts (MaskedOne, MaskedTwo)
   * sharing an identifier, with the salt handed through a reused `let salt`, was classified
   * INDETERMINATE — and the tool printed "No true collisions: every salt claimed by more than one
   * call site names the same contract" and exited 0. A clean headline over a real collision.
   *
   * Unknown must not read as safe. A gate that resolves ambiguity in favour of passing is the
   * failure mode this repository has now hit three times (#1084, #1090, and here).
   */
  if (registry.indeterminate.length > 0) return 1;

  if (
    args.has("--strict") &&
    (registry.unresolved.length > 0 ||
      registry.unresolvedContractNames.length > 0 ||
      registry.parseFailures.length > 0)
  ) {
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = {
  buildSaltRegistry,
  computeSalt,
  formatReport,
  normalizeTenantId,
  DEFAULT_ROOTS,
};
