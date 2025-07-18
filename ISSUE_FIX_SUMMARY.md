# Fix for Issue #289: Ubuntu/Debian Server Process Hangs

## Problem
The issue was that when using the 'u' option to update the workshop, the server would restart but on a different port because the default port was still in use. This happened because the original server processes were not being properly terminated on Ubuntu/Debian systems.

## Root Cause
The problem was in the `killChild` function in `packages/workshop-cli/src/commands/start.ts`. When using `shell: true` with `spawn`, Node.js creates a shell process that then spawns the actual Node.js application process. When calling `child.kill()`, it only killed the shell process, not the actual Node.js process that was running the server, which continued to run and hold the port.

This is a common issue on Unix-like systems (Ubuntu/Debian) where the shell process and the actual application process have different PIDs, and killing the shell doesn't automatically kill its child processes.

## Solution
The fix involved two main changes:

### 1. Modified Process Spawning
Added the `detached: true` option when spawning child processes on Unix-like systems to create a new process group:

```typescript
child = spawn(childCommand, [], {
    shell: true,
    cwd: appDir,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: childEnv,
    // Create a new process group on Unix-like systems so we can kill the entire tree
    detached: process.platform !== 'win32',
})
```

### 2. Enhanced killChild Function
Completely rewrote the `killChild` function to properly handle process trees:

```typescript
async function killChild(child: ChildProcess | null): Promise<void> {
    if (!child || !child.pid) return
    
    return new Promise((resolve) => {
        const onExit = () => resolve()
        child.once('exit', onExit)
        
        // On Unix-like systems, when using shell: true, we need to kill the entire process tree
        // because the shell spawns child processes that won't be killed by just killing the shell
        if (process.platform !== 'win32') {
            try {
                // Kill the entire process group to ensure all child processes are terminated
                // The negative PID means kill the process group
                process.kill(-child.pid!, 'SIGTERM')
                
                // Give processes time to gracefully shut down
                setTimeout(() => {
                    try {
                        // Force kill if still running
                        process.kill(-child.pid!, 'SIGKILL')
                    } catch {
                        // Process might already be dead, ignore errors
                    }
                }, 5000)
            } catch (error) {
                // If process group killing fails, fall back to killing just the main process
                child.kill('SIGTERM')
                setTimeout(() => {
                    try {
                        child.kill('SIGKILL')
                    } catch {
                        // Process might already be dead, ignore errors
                    }
                }, 5000)
            }
        } else {
            // On Windows, just kill the process normally
            child.kill()
        }
    })
}
```

### 3. Updated Cleanup Function
Modified the cleanup function to use the improved process killing logic:

```typescript
async function cleanupBeforeExit() {
    if (process.platform === 'win32' && child?.pid) {
        // Use a Promise to wait for taskkill to finish
        // The /t flag kills the process tree, which is what we want
        await new Promise<void>((resolve) => {
            const killer = spawn('taskkill', [
                '/pid',
                child!.pid!.toString(),
                '/f',
                '/t',
            ])
            killer.on('exit', resolve)
        })
    } else {
        // On Unix-like systems, use our improved killChild function
        await killChild(child)
    }
    if (server) await new Promise((resolve) => server!.close(resolve))
}
```

## How This Fixes the Issue
1. **Process Group Creation**: By setting `detached: true`, we create a new process group that contains all child processes.
2. **Process Group Termination**: Using `process.kill(-child.pid!, 'SIGTERM')` with a negative PID kills the entire process group, ensuring all child processes are terminated.
3. **Graceful Shutdown**: We first send `SIGTERM` to allow processes to shut down gracefully, then follow up with `SIGKILL` if they don't respond within 5 seconds.
4. **Fallback Handling**: If process group killing fails, we fall back to the original single-process killing method.

## Result
Now when the workshop is updated or restarted, all server processes are properly terminated, freeing up the port so the new server can start on the correct port without conflicts.

## Files Modified
- `packages/workshop-cli/src/commands/start.ts`: Enhanced process spawning and killing logic