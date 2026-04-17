import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow } from 'electron';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock('../../utils/paths', () => ({
  zerantDir: vi.fn((...args: string[]) => '/tmp/zerant-test/' + args.join('/')),
}));

vi.mock('../../utils/constants', () => ({
  DEFAULT_TIMEOUT_MS: 30000,
}));

vi.mock('../../input/humanized', () => ({
  humanizedClick: vi.fn().mockResolvedValue(undefined),
  humanizedType: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../utils/security', () => ({
  assertSinglePathSegment: vi.fn((id: string) => id),
  resolvePathWithinRoot: vi.fn((root: string, file: string) => root + '/' + file),
}));

import * as fs from 'fs';
import { WorkflowEngine } from '../engine';

function createMockWebview() {
  return {
    webContents: {
      getURL: vi.fn().mockReturnValue('https://example.com'),
      getTitle: vi.fn().mockReturnValue('Test'),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      loadURL: vi.fn().mockResolvedValue(undefined),
      once: vi.fn(),
      capturePage: vi.fn().mockResolvedValue({
        toPNG: () => Buffer.alloc(100),
      }),
      sendInputEvent: vi.fn(),
    },
  } as unknown as BrowserWindow;
}

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    engine = new WorkflowEngine();
  });

  describe('constructor', () => {
    it('creates workflows directory', () => {
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('getWorkflows()', () => {
    it('returns empty array when no workflows exist', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      const workflows = await engine.getWorkflows();
      expect(workflows).toEqual([]);
    });

    it('reads and parses workflow JSON files', async () => {
      const workflow = { id: 'w1', name: 'Test', steps: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' };
      vi.mocked(fs.readdirSync).mockReturnValue(['w1.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(workflow));

      const workflows = await engine.getWorkflows();
      expect(workflows).toHaveLength(1);
      expect(workflows[0].name).toBe('Test');
    });

    it('skips non-json files', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue(['readme.md' as unknown as fs.Dirent, 'w1.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ id: 'w1', name: 'Test', steps: [] }));

      const workflows = await engine.getWorkflows();
      expect(workflows).toHaveLength(1);
    });
  });

  describe('saveWorkflow()', () => {
    it('saves workflow with generated id and timestamps', async () => {
      const id = await engine.saveWorkflow({
        name: 'My Workflow',
        description: 'Test workflow',
        steps: [{ id: 's1', type: 'navigate', params: { url: 'https://example.com' } }],
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(fs.writeFileSync).toHaveBeenCalled();

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(c => String(c[1]).includes('My Workflow'));
      expect(writeCall).toBeDefined();
      const saved = JSON.parse(writeCall![1] as string);
      expect(saved.name).toBe('My Workflow');
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
    });
  });

  describe('deleteWorkflow()', () => {
    it('deletes workflow file if it exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await engine.deleteWorkflow('w1');
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('does nothing if workflow does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await engine.deleteWorkflow('nonexistent');
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('stopWorkflow()', () => {
    it('marks running execution as aborted', async () => {
      // Create a workflow file that runWorkflow can find
      const workflow = {
        id: 'w1', name: 'Test', steps: [
          { id: 's1', type: 'wait', params: { duration: 60000 } }, // long wait
        ], createdAt: '2024-01-01', updatedAt: '2024-01-01',
      };
      vi.mocked(fs.readdirSync).mockReturnValue(['w1.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(workflow));

      const webview = createMockWebview();
      const execId = await engine.runWorkflow('w1', webview);

      await engine.stopWorkflow(execId);
      const status = await engine.getExecutionStatus(execId);
      expect(status!.status).toBe('aborted');
    });
  });

  describe('getExecutionStatus()', () => {
    it('returns null for unknown execution', async () => {
      const status = await engine.getExecutionStatus('nonexistent');
      expect(status).toBeNull();
    });
  });

  describe('getRunningExecutions()', () => {
    it('returns empty array when no executions exist', async () => {
      const running = await engine.getRunningExecutions();
      expect(running).toEqual([]);
    });
  });

  describe('runWorkflow()', () => {
    it('throws when workflow not found', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      await expect(engine.runWorkflow('nonexistent', createMockWebview())).rejects.toThrow('not found');
    });

    it('starts execution and returns execution id', async () => {
      const workflow = {
        id: 'w1', name: 'Simple', steps: [], createdAt: '2024-01-01', updatedAt: '2024-01-01',
      };
      vi.mocked(fs.readdirSync).mockReturnValue(['w1.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(workflow));

      const webview = createMockWebview();
      const execId = await engine.runWorkflow('w1', webview);
      expect(typeof execId).toBe('string');
    });

    it('merges initial variables with workflow variables', async () => {
      const workflow = {
        id: 'w1', name: 'Vars', steps: [],
        variables: { a: 1 },
        createdAt: '2024-01-01', updatedAt: '2024-01-01',
      };
      vi.mocked(fs.readdirSync).mockReturnValue(['w1.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(workflow));

      const webview = createMockWebview();
      const execId = await engine.runWorkflow('w1', webview, { b: 2 });

      // Wait for background execution to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      const status = await engine.getExecutionStatus(execId);
      expect(status!.variables).toEqual({ a: 1, b: 2 });
    });
  });

  describe('workflow execution with condition steps', () => {
    it('handles variableEquals condition', async () => {
      const workflow = {
        id: 'w1', name: 'Cond', steps: [
          {
            id: 'check', type: 'condition', params: {
              condition: 'variableEquals', variable: 'flag', value: true,
              onTrue: 'continue', onFalse: 'abort',
            },
          },
          { id: 'after', type: 'wait', params: { duration: 1 } },
        ], variables: { flag: true }, createdAt: '2024-01-01', updatedAt: '2024-01-01',
      };
      vi.mocked(fs.readdirSync).mockReturnValue(['w1.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(workflow));

      const webview = createMockWebview();
      const execId = await engine.runWorkflow('w1', webview);

      await new Promise(resolve => setTimeout(resolve, 100));
      const status = await engine.getExecutionStatus(execId);
      expect(status!.status).toBe('completed');
      expect(status!.stepResults).toHaveLength(2);
    });
  });

  describe('generateId()', () => {
    it('generates unique IDs', async () => {
      const id1 = await engine.saveWorkflow({ name: 'A', steps: [] });
      const id2 = await engine.saveWorkflow({ name: 'B', steps: [] });
      expect(id1).not.toBe(id2);
    });
  });
});
