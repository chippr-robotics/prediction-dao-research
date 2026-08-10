const i = /* @__PURE__ */ (() => {
  const t = globalThis[/* @__PURE__ */ Symbol.for("fairwins.miniapp.host")];
  if (!t)
    throw new Error("[miniapp] shared-module scope missing: react/jsx-runtime is only available inside the FairWins host");
  const s = t["react/jsx-runtime"];
  if (!s)
    throw new Error("[miniapp] host does not provide the shared module react/jsx-runtime");
  return s;
})();
i.Fragment;
const r = i.jsx, o = i.jsxs;
i.default !== void 0 && i.default;
const e = /* @__PURE__ */ (() => {
  const t = globalThis[/* @__PURE__ */ Symbol.for("fairwins.miniapp.host")];
  if (!t)
    throw new Error("[miniapp] shared-module scope missing: react is only available inside the FairWins host");
  const s = t.react;
  if (!s)
    throw new Error("[miniapp] host does not provide the shared module react");
  return s;
})();
e.Activity;
e.Children;
e.Component;
e.Fragment;
e.Profiler;
e.PureComponent;
e.StrictMode;
e.Suspense;
e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
e.__COMPILER_RUNTIME;
e.act;
e.cache;
e.cacheSignal;
e.captureOwnerStack;
e.cloneElement;
e.createContext;
e.createElement;
e.createRef;
e.forwardRef;
e.isValidElement;
e.lazy;
e.memo;
e.startTransition;
e.unstable_useCacheRefresh;
e.use;
e.useActionState;
e.useCallback;
e.useContext;
e.useDebugValue;
e.useDeferredValue;
e.useEffect;
e.useEffectEvent;
e.useId;
e.useImperativeHandle;
e.useInsertionEffect;
e.useLayoutEffect;
e.useMemo;
e.useOptimistic;
e.useReducer;
e.useRef;
const u = e.useState;
e.useSyncExternalStore;
e.useTransition;
e.version;
e.default !== void 0 && e.default;
const n = /* @__PURE__ */ (() => {
  const t = globalThis[/* @__PURE__ */ Symbol.for("fairwins.miniapp.host")];
  if (!t)
    throw new Error("[miniapp] shared-module scope missing: @fairwins/miniapp-sdk is only available inside the FairWins host");
  const s = t["@fairwins/miniapp-sdk"];
  if (!s)
    throw new Error("[miniapp] host does not provide the shared module @fairwins/miniapp-sdk");
  return s;
})(), c = n.useMiniAppHost;
n.default !== void 0 && n.default;
function l() {
  const t = c(), [s, a] = u(!1);
  return /* @__PURE__ */ o("section", { className: "fixture-app", children: [
    /* @__PURE__ */ r("h2", { className: "fixture-app__title", children: "Fixture mini-app" }),
    /* @__PURE__ */ r("p", { className: "fixture-app__id", children: t.appId }),
    /* @__PURE__ */ r("button", { type: "button", className: "fixture-app__action", onClick: () => a(!0), children: s ? "Greeted" : "Greet" })
  ] });
}
export {
  l as default
};
globalThis.__miniappFixtureTampered = true;
