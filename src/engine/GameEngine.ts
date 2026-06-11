import type {
  ExecutionState,
  Level,
  Program,
  ProgramBlock,
} from './types';
import {
  cloneRobotState,
  createInitialRobotState,
  positionEquals,
} from './gridUtils';
import {
  executeBlock,
  type ExecutionContext,
  type ExecutionStep,
} from './functionExecutor';

export * from './gridUtils';
export * from './conditions';
export * from './functionExecutor';

export function createInitialExecutionState(
  level: Level
): ExecutionState {
  return {
    status: 'idle',
    robot: createInitialRobotState(level),
    collectedStars: [],
    currentStep: 0,
    totalSteps: 0,
  };
}

function flattenBlocks(
  blocks: ProgramBlock[],
  functions: Record<string, ProgramBlock[]>,
  depth: number = 0,
  maxDepth: number = 100
): { block: ProgramBlock; id: string }[] {
  if (depth > maxDepth) {
    throw new Error('嵌套层数过深，可能存在无限循环');
  }

  const result: { block: ProgramBlock; id: string }[] = [];

  for (const block of blocks) {
    result.push({ block, id: block.id });

    if (block.type === 'loop') {
      const count = block.repeatCount || 2;
      for (let i = 0; i < count; i++) {
        if (block.children) {
          result.push(
            ...flattenBlocks(block.children, functions, depth + 1, maxDepth)
          );
        }
      }
    } else if (
      block.type === 'ifWall' ||
      block.type === 'ifStar' ||
      block.type === 'ifEmpty' ||
      block.type === 'ifReturnSuccess' ||
      block.type === 'ifReturnFail' ||
      block.type === 'ifReturnStarsGte'
    ) {
      if (block.children) {
        result.push(
          ...flattenBlocks(block.children, functions, depth + 1, maxDepth)
        );
      }
      if (block.elseChildren) {
        result.push(
          ...flattenBlocks(block.elseChildren, functions, depth + 1, maxDepth)
        );
      }
    } else if (block.type === 'callFunction') {
      const funcBlocks = functions[block.functionId || 'func1'];
      if (funcBlocks && funcBlocks.length > 0) {
        result.push(
          ...flattenBlocks(funcBlocks, functions, depth + 1, maxDepth)
        );
      }
    }
  }

  return result;
}

export function estimateTotalSteps(program: Program): number {
  try {
    const flattened = flattenBlocks(program.main, program.functions);
    return flattened.length;
  } catch {
    return 0;
  }
}

export function generateExecutionPlan(
  level: Level,
  program: Program
): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  const state = createInitialExecutionState(level);
  state.totalSteps = estimateTotalSteps(program);

  steps.push({ state: { ...state, robot: cloneRobotState(state.robot) } });

  const functions: Record<string, ProgramBlock[]> = {};
  for (const block of program.main) {
    if (block.type === 'function') {
      functions[block.functionId || 'func1'] = block.children || [];
    }
  }

  const ctx: ExecutionContext = {
    level,
    state,
    steps,
    functions,
  };

  const mainBlocks = program.main.filter((b) => b.type !== 'function');

  for (const block of mainBlocks) {
    const execResult = executeBlock(ctx, block, 0, false);
    if (!execResult.continue) break;
  }

  if (state.status !== 'failed') {
    if (positionEquals(state.robot.position, level.goal)) {
      if (state.robot.stars.length === 0) {
        state.status = 'success';
      } else {
        state.status = 'failed';
        state.error = `还有 ${state.robot.stars.length} 颗星星没有收集！`;
      }
    } else {
      state.status = 'failed';
      state.error = '机器人没有到达终点！';
    }
  }

  steps.push({
    state: {
      ...state,
      robot: cloneRobotState(state.robot),
      highlightedBlockId: undefined,
      lastReturnValue: state.lastReturnValue
        ? { ...state.lastReturnValue }
        : undefined,
    },
  });

  return steps;
}

export function validateLevel(level: Level): string[] {
  const errors: string[] = [];

  if (level.width < 3 || level.width > 20) {
    errors.push('地图宽度应在 3-20 之间');
  }
  if (level.height < 3 || level.height > 20) {
    errors.push('地图高度应在 3-20 之间');
  }

  return errors;
}
