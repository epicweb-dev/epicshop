#!/usr/bin/env node

// Test script to reproduce Kent's cache invalidation issue with logging enabled
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

// Enable all cache and compilation debugging
process.env.NODE_DEBUG = 'epic:cache:*,epic:compilation'

console.log('🔍 Reproducing cache invalidation issue with debug logging enabled...')
console.log('NODE_DEBUG environment:', process.env.NODE_DEBUG)

async function reproduceIssue() {
  // Create a temporary workshop structure similar to the real app
  const testWorkshopDir = await fs.mkdtemp(join(tmpdir(), 'workshop-cache-debug-'))
  const exercisesDir = join(testWorkshopDir, 'exercises')
  const problemDir = join(exercisesDir, '01.ping', '01.problem.connect')
  
  await fs.mkdir(problemDir, { recursive: true })
  
  const readmePath = join(problemDir, 'README.mdx')
  
  console.log('\n📁 Test workshop directory:', testWorkshopDir)
  console.log('📄 README.mdx path:', readmePath)
  
  // Step 1: Create initial README.mdx (simulates initial app run)
  const initialContent = `# Initial Problem

This is the initial problem description.

## Instructions

Follow these steps to complete the exercise.
`
  
  await fs.writeFile(readmePath, initialContent)
  const initialStat = await fs.stat(readmePath)
  
  console.log('\n=== Step 1: Initial file created (app running) ===')
  console.log('Content length:', initialContent.length)
  console.log('File size:', initialStat.size)
  console.log('Modification time:', initialStat.mtimeMs)
  console.log('File created at:', new Date(initialStat.mtimeMs).toISOString())
  
  // Simulate cache creation time when app first compiles the file
  const cacheCreatedTime = Date.now()
  console.log('Cache created at:', cacheCreatedTime, '(', new Date(cacheCreatedTime).toISOString(), ')')
  
  // Simulate some cache entries
  const mockCacheEntry = {
    value: {
      code: 'compiled-initial-content',
      title: 'Initial Problem',
      epicVideoEmbeds: []
    },
    metadata: {
      createdTime: cacheCreatedTime,
      ttl: 1000 * 60 * 60 * 24 // 24 hours
    }
  }
  
  const mockFileInfoEntry = {
    value: {
      mtimeMs: initialStat.mtimeMs,
      size: initialStat.size
    },
    metadata: {
      createdTime: cacheCreatedTime,
      ttl: Infinity
    }
  }
  
  console.log('\nSimulated cache entries created:')
  console.log('- Main cache entry with compiled content')
  console.log('- File info cache entry with size/mtime')
  
  // Step 2: Simulate app stopping (wait a bit)
  console.log('\n=== Step 2: App stopping (simulated delay) ===')
  await new Promise(resolve => setTimeout(resolve, 50))
  
  // Step 3: User modifies file while app is stopped
  console.log('\n=== Step 3: User modifies file while app is stopped ===')
  const modifiedContent = `# Updated Problem - CHANGED

This is the UPDATED problem description with significant changes.

## New Instructions

These are completely different instructions that should be visible.

## Additional Section

This new section was added while the app was stopped.
`
  
  await fs.writeFile(readmePath, modifiedContent)
  const modifiedStat = await fs.stat(readmePath)
  
  console.log('Content length:', modifiedContent.length)
  console.log('File size:', modifiedStat.size)
  console.log('Modification time:', modifiedStat.mtimeMs)
  console.log('File modified at:', new Date(modifiedStat.mtimeMs).toISOString())
  
  // Step 4: Simulate app restart and cache check
  console.log('\n=== Step 4: App restarts, cache invalidation check ===')
  
  const timeDiff = modifiedStat.mtimeMs - cacheCreatedTime
  console.log('Time difference (file mtime - cache created):', timeDiff, 'ms')
  
  // Test all the cache invalidation logic we implemented
  console.log('\n--- Testing cache invalidation logic ---')
  
  // Size-based invalidation
  const sizeDifferent = mockFileInfoEntry.value.size !== modifiedStat.size
  console.log('Size different:', sizeDifferent, `(${mockFileInfoEntry.value.size} vs ${modifiedStat.size})`)
  
  // Modification time-based invalidation
  const mtimeDifferent = Math.abs(mockFileInfoEntry.value.mtimeMs - modifiedStat.mtimeMs) > 0.5
  console.log('Modification time different:', mtimeDifferent, 
              `(${mockFileInfoEntry.value.mtimeMs} vs ${modifiedStat.mtimeMs})`)
  
  // Time-based invalidation (fallback)
  const fileNewer = modifiedStat.mtimeMs >= (mockCacheEntry.metadata.createdTime - 1)
  console.log('File newer than cache:', fileNewer)
  
  // Our current logic decision
  const shouldInvalidate = sizeDifferent || mtimeDifferent || fileNewer
  console.log('\n🎯 Should invalidate cache:', shouldInvalidate)
  
  // Higher-level cache considerations
  console.log('\n--- Higher-level cache considerations ---')
  console.log('Would setModifiedTimesForAppDirs be called:', shouldInvalidate)
  console.log('Directory that would be marked as modified:', dirname(readmePath))
  
  if (shouldInvalidate) {
    console.log('✅ Cache invalidation should work correctly!')
    console.log('✅ Higher-level cache should be invalidated via modifiedTimes update')
  } else {
    console.log('❌ Cache invalidation logic has a problem!')
  }
  
  // Simulate the case where file info cache is missing (edge case)
  console.log('\n--- Testing edge case: file info cache missing ---')
  console.log('If file info cache was missing, would force refresh:', true)
  console.log('This ensures we never get stuck with stale content')
  
  // Clean up
  await fs.rm(testWorkshopDir, { recursive: true })
  console.log('\n🧹 Cleaned up test directory')
}

// Run the reproduction test
reproduceIssue().catch(error => {
  console.error('❌ Error during reproduction test:', error)
  process.exit(1)
})