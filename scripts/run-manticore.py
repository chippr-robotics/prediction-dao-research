#!/usr/bin/env python3
"""
Wrapper script for running Manticore symbolic execution on Solidity contracts.
Handles proper configuration including solc remappings and import resolution.
This script constructs the proper manticore command with all needed arguments.
"""

import sys
import os
import subprocess
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='Run Manticore symbolic execution on Solidity contracts')
    parser.add_argument('contract_path', help='Path to the Solidity contract file')
    parser.add_argument('--contract', help='Contract name to analyze', required=True)
    parser.add_argument('--timeout', type=int, default=300, help='Timeout in seconds (default: 300)')
    
    args = parser.parse_args()
    
    # Get the project root directory
    project_root = Path(__file__).parent.parent.absolute()
    
    # Set up environment
    os.chdir(project_root)
    
    # Check if remappings.txt exists
    remappings_file = project_root / "remappings.txt"
    if not remappings_file.exists():
        print(f"Error: remappings.txt not found at {remappings_file}", file=sys.stderr)
        sys.exit(1)
    
    # Check if node_modules exists
    node_modules = project_root / "node_modules"
    if not node_modules.exists():
        print(f"Error: node_modules not found at {node_modules}", file=sys.stderr)
        print("Please run 'npm ci' first", file=sys.stderr)
        sys.exit(1)
    
    # Read remappings from remappings.txt
    remappings = []
    with open(remappings_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                # Keep the remapping format as-is
                remappings.append(line)
    
    print(f"Using remappings: {remappings}")
    
    # Build the manticore command
    cmd = ['manticore', str(args.contract_path)]
    cmd.extend(['--contract', args.contract])
    
    # Add remappings as solc arguments
    for remap in remappings:
        cmd.extend(['--solc-remaps', remap])
    
    # Set verbosity
    cmd.extend(['-v'])
    
    print(f"\nRunning command: {' '.join(cmd)}")
    print(f"Working directory: {project_root}")
    print(f"\nStarting Manticore analysis (timeout: {args.timeout}s)...")
    print("This may take several minutes...\n")
    
    # Run manticore with the constructed command
    try:
        result = subprocess.run(
            cmd,
            cwd=project_root,
            timeout=args.timeout,
            capture_output=False,
            text=True
        )
        
        if result.returncode == 0:
            print(f"\n✓ Manticore analysis completed successfully!")
        else:
            print(f"\n⚠ Manticore analysis completed with warnings (exit code: {result.returncode})")
            
        # Look for mcore_* directories
        mcore_dirs = list(project_root.glob("mcore_*"))
        if mcore_dirs:
            print(f"\nResults saved in:")
            for mcore_dir in mcore_dirs:
                print(f"  - {mcore_dir.relative_to(project_root)}")
        else:
            print("\n⚠ No mcore_* directories found - analysis may not have generated results")
            
        sys.exit(result.returncode)
        
    except subprocess.TimeoutExpired:
        print(f"\n⚠ Manticore analysis timed out after {args.timeout}s")
        print("Partial results may be available in mcore_* directories")
        
        # Use exit code 124 (standard timeout exit code) instead of 0
        # This allows CI systems to distinguish timeouts from successful completion
        mcore_dirs = list(project_root.glob("mcore_*"))
        if mcore_dirs:
            print(f"\nPartial results found in:")
            for mcore_dir in mcore_dirs:
                print(f"  - {mcore_dir.relative_to(project_root)}")
        
        sys.exit(124)  # Standard timeout exit code
        
    except FileNotFoundError:
        print(f"\n✗ Error: manticore command not found", file=sys.stderr)
        print("Please ensure Manticore is installed: pip install manticore[native]", file=sys.stderr)
        sys.exit(1)
        
    except Exception as e:
        print(f"\n✗ Unexpected error running Manticore: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
