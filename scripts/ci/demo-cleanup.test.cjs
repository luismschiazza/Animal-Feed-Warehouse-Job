'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { cleanup } = require('./demo-cleanup.cjs');

test('CI fixture cleanup is not available as a development force/reset command', () => {
  const previous = process.env.GITHUB_ACTIONS,
    spawn = cp.spawnSync;
  let calls = 0;
  try {
    delete process.env.GITHUB_ACTIONS;
    cp.spawnSync = () => {
      calls++;
      throw new Error('Unexpected Docker call');
    };
    assert.throws(() => cleanup('/tmp/unknown'), /ownership/);
    assert.equal(calls, 0);
  } finally {
    cp.spawnSync = spawn;
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
  }
});

test('even in Actions, unknown report/private roots fail before Docker or file deletion', () => {
  const previous = {
      CI: process.env.CI,
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
      CI_REPORTS: process.env.CI_REPORTS,
    },
    spawn = cp.spawnSync;
  let calls = 0;
  try {
    process.env.CI = 'true';
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CI_REPORTS = '/tmp/afw-ci-123-1-demo';
    cp.spawnSync = () => {
      calls++;
      throw new Error('Unexpected Docker call');
    };
    assert.throws(() => cleanup('/tmp/not-this-job'), /ownership/);
    assert.equal(calls, 0);
  } finally {
    cp.spawnSync = spawn;
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
