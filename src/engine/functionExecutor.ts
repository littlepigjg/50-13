import type {
  ExecutionState,
  FunctionReturnValue,
  Level,
  ProgramBlock,
  RobotState,
} from './types';
import {
  cloneRobotState,
  getCellAt,
  getForwardPosition,
  isWalkable,
  positionEquals,
  turnLeft,
  turnRight,
} from './gridUtils';
import { evaluateCondition, type ConditionContext } from './conditions';

export interface ExecutionStep {
  state: ExecutionState;
  blockId?: string;
}

export interface ExecuteResult {
  continue: boolean;
  returnValue?: FunctionReturnValue;
  shouldReturnFromFunction?: boolean;
  functionError?: string;
}

export interface ExecutionContext {
  level: Level;
  state: ExecutionState;
  steps: ExecutionStep[];
  functions: Record<string, ProgramBlock[]>;
}

export function snapshotState(state: ExecutionState): {
  robot: RobotState;
  collectedStars: typeof state.collectedStars;
  currentStep: number;
} {
  return {
    robot: cloneRobotState(state.robot),
    collectedStars: state.collectedStars.map((s) => ({ ...s })),
    currentStep: state.currentStep,
  };
}

export function restoreState(
  state: ExecutionState,
  snapshot: ReturnType<typeof snapshotState>
): void {
  state.robot = cloneRobotState(snapshot.robot);
  state.collectedStars = snapshot.collectedStars.map((s) => ({ ...s }));
  state.currentStep = snapshot.currentStep;
}

export function pushStep(ctx: ExecutionContext, blockId?: string): void {
  ctx.steps.push({
    state: {
      ...ctx.state,
      robot: cloneRobotState(ctx.state.robot),
      lastReturnValue: ctx.state.lastReturnValue
        ? { ...ctx.state.lastReturnValue }
        : undefined,
    },
    blockId,
  });
}

export function makeDefaultReturnValue(
  state: ExecutionState,
  success: boolean = true
): FunctionReturnValue {
  return {
    success,
    starsCollected: state.collectedStars.length,
  };
}

export function executeMoveBlock(ctx: ExecutionContext): ExecuteResult {
  const { level, state } = ctx;
  const nextPos = getForwardPosition(state.robot);

  if (!isWalkable(level, nextPos)) {
    return {
      continue: false,
      functionError: '机器人撞到了障碍物！',
    };
  }

  state.robot.position = nextPos;
  state.currentStep++;

  const starIndex = state.robot.stars.findIndex((s) =>
    positionEquals(s, nextPos)
  );
  if (starIndex !== -1) {
    const [collected] = state.robot.stars.splice(starIndex, 1);
    state.collectedStars.push(collected);
  }

  const cell = getCellAt(level, nextPos);
  if (cell === 'pit') {
    pushStep(ctx);
    return {
      continue: false,
      functionError: '机器人掉进了陷阱！',
    };
  }

  return { continue: true };
}

export function executeTurnLeft(ctx: ExecutionContext): ExecuteResult {
  ctx.state.robot.direction = turnLeft(ctx.state.robot.direction);
  ctx.state.currentStep++;
  return { continue: true };
}

export function executeTurnRight(ctx: ExecutionContext): ExecuteResult {
  ctx.state.robot.direction = turnRight(ctx.state.robot.direction);
  ctx.state.currentStep++;
  return { continue: true };
}

export function executeLoopBlock(
  ctx: ExecutionContext,
  block: ProgramBlock,
  depth: number,
  inFunction: boolean
): ExecuteResult {
  const count = block.repeatCount || 2;
  let result: ExecuteResult = { continue: true };

  for (let i = 0; i < count; i++) {
    if (block.children) {
      for (const child of block.children) {
        const childResult = executeBlock(ctx, child, depth + 1, inFunction);
        if (!childResult.continue) {
          return childResult;
        }
        if (childResult.shouldReturnFromFunction) {
          return childResult;
        }
      }
    }
    if (!result.continue || result.shouldReturnFromFunction) break;
  }

  return result;
}

export function executeConditionBlock(
  ctx: ExecutionContext,
  block: ProgramBlock,
  depth: number,
  inFunction: boolean
): ExecuteResult {
  const condCtx: ConditionContext = {
    level: ctx.level,
    robot: ctx.state.robot,
    state: ctx.state,
  };

  if (evaluateCondition(block, condCtx)) {
    if (block.children) {
      for (const child of block.children) {
        const childResult = executeBlock(ctx, child, depth + 1, inFunction);
        if (!childResult.continue) {
          return childResult;
        }
        if (childResult.shouldReturnFromFunction) {
          return childResult;
        }
      }
    }
  }

  return { continue: true };
}

export function executeCallFunction(
  ctx: ExecutionContext,
  block: ProgramBlock,
  depth: number
): ExecuteResult {
  const funcBlocks = ctx.functions[block.functionId || 'func1'];

  if (!funcBlocks || funcBlocks.length === 0) {
    ctx.state.lastReturnValue = { success: false, starsCollected: ctx.state.collectedStars.length };
    return { continue: true };
  }

  const preSnapshot = snapshotState(ctx.state);
  let funcReturnValue: FunctionReturnValue = makeDefaultReturnValue(ctx.state, true);
  let funcReturnedEarly = false;
  let functionHadError = false;

  for (const child of funcBlocks) {
    const childResult = executeBlock(ctx, child, depth + 1, true);

    if (!childResult.continue) {
      functionHadError = true;
      funcReturnValue = {
        success: false,
        starsCollected: preSnapshot.collectedStars.length,
      };
      break;
    }

    if (childResult.shouldReturnFromFunction && childResult.returnValue) {
      funcReturnValue = childResult.returnValue;
      funcReturnedEarly = true;
      break;
    }
  }

  if (functionHadError) {
    restoreState(ctx.state, preSnapshot);
    ctx.state.lastReturnValue = funcReturnValue;
    return { continue: true };
  }

  if (!funcReturnedEarly) {
    funcReturnValue = makeDefaultReturnValue(ctx.state, true);
  }

  ctx.state.lastReturnValue = funcReturnValue;
  return { continue: true };
}

export function executeReturnSuccess(
  ctx: ExecutionContext,
  inFunction: boolean
): ExecuteResult {
  if (!inFunction) return { continue: true };
  return {
    continue: true,
    shouldReturnFromFunction: true,
    returnValue: {
      success: true,
      starsCollected: ctx.state.collectedStars.length,
    },
  };
}

export function executeReturnFail(
  ctx: ExecutionContext,
  inFunction: boolean
): ExecuteResult {
  if (!inFunction) return { continue: true };
  return {
    continue: true,
    shouldReturnFromFunction: true,
    returnValue: {
      success: false,
      starsCollected: ctx.state.collectedStars.length,
    },
  };
}

export function executeReturnStars(
  ctx: ExecutionContext,
  inFunction: boolean
): ExecuteResult {
  if (!inFunction) return { continue: true };
  return {
    continue: true,
    shouldReturnFromFunction: true,
    returnValue: {
      success: true,
      starsCollected: ctx.state.collectedStars.length,
    },
  };
}

export function executeBlock(
  ctx: ExecutionContext,
  block: ProgramBlock,
  depth: number = 0,
  inFunction: boolean = false
): ExecuteResult {
  if (depth > 100) {
    ctx.state.status = 'failed';
    ctx.state.error = '嵌套层数过深，可能存在无限循环';
    return { continue: false };
  }

  ctx.state.highlightedBlockId = block.id;
  pushStep(ctx, block.id);

  let result: ExecuteResult = { continue: true };

  switch (block.type) {
    case 'move':
      result = executeMoveBlock(ctx);
      if (!result.continue && inFunction) {
        return {
          continue: false,
          functionError: result.functionError,
        };
      }
      if (!result.continue) {
        ctx.state.status = 'failed';
        ctx.state.error = result.functionError || '执行失败';
      }
      break;

    case 'turnLeft':
      result = executeTurnLeft(ctx);
      break;

    case 'turnRight':
      result = executeTurnRight(ctx);
      break;

    case 'loop':
      result = executeLoopBlock(ctx, block, depth, inFunction);
      break;

    case 'ifWall':
    case 'ifStar':
    case 'ifEmpty':
    case 'ifReturnSuccess':
    case 'ifReturnFail':
    case 'ifReturnStarsGte':
      result = executeConditionBlock(ctx, block, depth, inFunction);
      break;

    case 'callFunction':
      result = executeCallFunction(ctx, block, depth);
      break;

    case 'returnSuccess':
      result = executeReturnSuccess(ctx, inFunction);
      break;

    case 'returnFail':
      result = executeReturnFail(ctx, inFunction);
      break;

    case 'returnStars':
      result = executeReturnStars(ctx, inFunction);
      break;

    default:
      break;
  }

  pushStep(ctx);
  return result;
}
