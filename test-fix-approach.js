#!/usr/bin/env node

// Test to verify the fix approach
console.log('Testing cache invalidation fix approach...')

// Simulate the issue scenario:
// 1. App cache created at time T1
// 2. File modified at time T2 > T1
// 3. modifiedTimes map gets updated to T2
// 4. getForceFresh should return true because T2 > T1

const cacheCreatedTime = Date.now()
console.log('Cache created at:', cacheCreatedTime)

// Wait a bit
setTimeout(() => {
  const fileModifiedTime = Date.now()
  console.log('File modified at:', fileModifiedTime)
  
  // Simulate what modifiedTimes would contain
  const modifiedTimes = new Map()
  modifiedTimes.set('/some/app/dir', fileModifiedTime)
  
  // Simulate getForceFresh logic
  const latestModifiedTime = Math.max(...Array.from(modifiedTimes.values()))
  const shouldInvalidate = latestModifiedTime > cacheCreatedTime
  
  console.log('Latest modified time:', latestModifiedTime)
  console.log('Should invalidate cache:', shouldInvalidate)
  
  if (shouldInvalidate) {
    console.log('✅ Fix should work! When we call setModifiedTimesForAppDirs, it will invalidate the app cache.')
  } else {
    console.log('❌ Fix would not work')
  }
}, 10)