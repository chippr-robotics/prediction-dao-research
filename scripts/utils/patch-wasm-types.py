#!/usr/bin/env python3
"""
Patch wasm/types.py to fix Python 3.10+ compatibility issue.
Replaces collections.Callable with collections.abc.Callable.
"""

import sys
import site
from pathlib import Path

def find_wasm_types():
    """Find the wasm/types.py file in installed packages."""
    site_packages = site.getsitepackages()
    for sp in site_packages:
        wasm_types = Path(sp) / "wasm" / "types.py"
        if wasm_types.exists():
            return wasm_types
    
    # Also check user site-packages
    user_site = site.getusersitepackages()
    wasm_types = Path(user_site) / "wasm" / "types.py"
    if wasm_types.exists():
        return wasm_types
    
    return None

def patch_file(file_path):
    """Patch the wasm/types.py file."""
    print(f"Patching {file_path}...")
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Check if already patched
    if 'collections.abc' in content and 'from collections.abc import' in content:
        print("File already patched.")
        return True
    
    # Replace collections.Callable with collections.abc.Callable
    original_content = content
    
    # Add import if not present
    if 'import collections.abc' not in content:
        if 'import collections' in content:
            content = content.replace('import collections\n', 'import collections\nimport collections.abc\n')
        else:
            # Add at the beginning after docstring
            lines = content.split('\n')
            insert_pos = 0
            for i, line in enumerate(lines):
                if not line.strip().startswith('#') and not line.strip().startswith('"""') and not line.strip().startswith("'''"):
                    insert_pos = i
                    break
            lines.insert(insert_pos, 'import collections.abc')
            content = '\n'.join(lines)
    
    # Replace all instances of collections.Callable with collections.abc.Callable
    content = content.replace('collections.Callable', 'collections.abc.Callable')
    
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print("File patched successfully.")
        return True
    else:
        print("No changes needed.")
        return True

def main():
    wasm_types = find_wasm_types()
    
    if wasm_types is None:
        print("Error: Could not find wasm/types.py in installed packages.", file=sys.stderr)
        print("Make sure the wasm package is installed.", file=sys.stderr)
        sys.exit(1)
    
    try:
        patch_file(wasm_types)
        print("Patch applied successfully!")
    except Exception as e:
        print(f"Error patching file: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
