# Product Requirements Document: Workshop CLI Extraction

## Project Overview

Extract the existing CLI functionality from `@epic-web/workshop-app` into a
standalone package `@epic-web/workshop-cli` while converting it to TypeScript
and enhancing it with proper argument parsing.

## Current State Analysis

### Existing CLI Location

- **File**: `packages/workshop-app/bin/epicshop.js` (322 lines)
- **Binary name**: `epicshop`
- **Package**: `@epic-web/workshop-app`

### Current Functionality

1. **Commands**:

   - `epicshop start` - Main command to start the workshop app
   - `epicshop update`/`epicshop upgrade` - Update local repository

2. **Advanced Features**:

   - Child process spawning with proper stdio handling
   - Mini HTTP server on port 3742 for web-based restart functionality
   - Interactive terminal with keyboard shortcuts:
     - `o` - open browser
     - `u` - update repo
     - `r` - restart app process
     - `k` - show Kody kudos messages
     - `q` or `Ctrl+C` - exit
   - Environment variable management for child processes
   - Port detection and management
   - Graceful shutdown handling
   - Cross-platform process management (Windows/Unix)

3. **Dependencies Used**:
   - `child_process`, `crypto`, `fs`, `http`, `os`, `path`, `url` (Node
     built-ins)
   - `chalk` - colored console output
   - `close-with-grace` - graceful shutdown
   - `get-port` - port management
   - `open` - browser opening
   - `@epic-web/workshop-utils/git.server` - git operations

## Requirements

### Functional Requirements

#### FR1: Package Structure

- **New package**: `@epic-web/workshop-cli`
- **NPM name**: `@epic-web/workshop-cli`
- **Binary name**: `epicshop` (preserved)
- **Language**: TypeScript
- **Build system**: Follow `workshop-utils` pattern using `tshy`

#### FR2: CLI Interface

- **Argument parsing**: Use `yargs` for robust CLI handling
- **Help system**: Add `--help` and `-h` support
- **Commands**: Preserve existing commands (`start`, `update`/`upgrade`)
- **Default behavior**: `start` command when no command specified

#### FR3: Preserved Functionality

- All existing child process management
- HTTP server for web-based updates (port 3742)
- Interactive terminal features (keyboard shortcuts)
- Environment variable handling
- Port detection and management
- Graceful shutdown
- Cross-platform compatibility
- Colored output and user experience

#### FR4: TypeScript Implementation

- Follow `workshop-utils` TypeScript configuration pattern
- Use `tsconfig.build.json` for build config
- Export compiled JS and type definitions
- ESM module format

### Technical Requirements

#### TR1: Build Configuration

- Use `tshy` for TypeScript compilation
- Generate ESM output in `dist/esm/`
- Include type definitions
- Follow existing package patterns

#### TR2: Nx Integration

- Create appropriate `project.json` if needed
- Update root `nx.json` to include new package in release configuration
- Ensure build dependencies work correctly

#### TR3: Dependencies

- Add required dependencies to new package
- Import `@epic-web/workshop-utils/git.server` for update functionality
- Use `yargs` for CLI parsing
- Preserve all existing functional dependencies

#### TR4: Packaging

- Configure `bin` field pointing to compiled binary
- Include necessary files in publish
- Set up proper publishConfig for public access

### Development Requirements

#### DR1: Development Convenience

- Add temporary 2-second auto-kill timer for development iteration
- Remove timer when functionality is working
- Ensure hot reloading during development

#### DR2: Code Quality

- Run format script to maintain code style
- Follow existing project conventions
- Add proper TypeScript types

### Non-Functional Requirements

#### NFR1: Backwards Compatibility

- `epicshop` binary must work identically to current version
- All existing scripts and workflows must continue working
- No breaking changes to user experience

#### NFR2: Performance

- No degradation in startup time or responsiveness
- Efficient child process management
- Minimal memory footprint

#### NFR3: Maintainability

- Clear TypeScript types
- Modular code structure
- Comprehensive error handling

## Implementation Plan

### Phase 1: Package Setup

1. Create new package structure in `packages/workshop-cli/`
2. Set up TypeScript configuration following `workshop-utils` pattern
3. Configure build system with `tshy`
4. Update Nx configuration

### Phase 2: Code Migration

1. Convert existing JavaScript to TypeScript
2. Implement yargs-based CLI interface
3. Add proper type definitions
4. Preserve all existing functionality

### Phase 3: Integration & Testing

1. Update `workshop-app` to remove CLI binary
2. Ensure new CLI works with existing workflows
3. Test all interactive features
4. Verify update functionality

### Phase 4: Polish & Release

1. Remove development timer
2. Run formatting
3. Update documentation
4. Configure publishing workflow

## Acceptance Criteria

### AC1: Functional Parity

- [ ] All existing commands work identically
- [ ] Interactive keyboard shortcuts function correctly
- [ ] HTTP server for updates works
- [ ] Child process spawning and management works
- [ ] Update functionality via git works

### AC2: Enhanced Features

- [ ] `--help` flag shows comprehensive usage information
- [ ] CLI follows standard argument parsing conventions
- [ ] TypeScript provides proper type safety

### AC3: Integration

- [ ] Nx build system works correctly
- [ ] Publishing configuration is set up
- [ ] Package can be installed and used independently

### AC4: Code Quality

- [ ] All code is properly formatted
- [ ] TypeScript compilation succeeds
- [ ] No linting errors
- [ ] Follows project conventions

## Success Metrics

- CLI functions identically to current implementation
- New package successfully publishes via Nx release workflow
- TypeScript compilation provides type safety
- Development iteration is smooth with temporary timer

## Risks & Mitigation

- **Risk**: Breaking existing functionality during migration
  - **Mitigation**: Incremental development with testing at each step
- **Risk**: Dependencies not working in new package structure
  - **Mitigation**: Careful dependency management and testing
- **Risk**: Nx configuration issues
  - **Mitigation**: Follow established patterns from other packages
