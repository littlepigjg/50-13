import type {
  CellType,
  Direction,
  ExecutionState,
  FunctionReturnValue,
  Level,
  Position,
  Program,
  ProgramBlock,
  RobotState,
} from './types';
import { DirectionVectors } from './types';

export function createEmptyGrid(width: number, height: number): CellType[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'empty' as CellType)
  );
}

export function isValidPosition(
  level: Level,
  pos: Position
): boolean {
  return (
    pos.x >= 0 &&
    pos.x < level.width &&
    pos.y >= 0 &&
    pos.y < level.height
  );
}

export function isWalkable(
  level: Level,
  pos: Position
): boolean {
  if (!isValidPosition(level, pos)) return false;
  const cell = level.grid[pos.y][pos.x];
  return cell !== 'wall';
}

export function getCellAt(level: Level, pos: Position): CellType | null {
  if (!isValidPosition(level, pos)) return null;
  return level.grid[pos.y][pos.x];
}

export function getForwardPosition(
  robot: RobotState
): Position {
  const vec = DirectionVectors[robot.direction];
  return {
    x: robot.position.x + vec.dx,
    y: robot.position.y + vec.dy,
  };
}

export function turnLeft(direction: Direction): Direction {
  return ((direction + 3) % 4) as Direction;
}

export function turnRight(direction: Direction): Direction {
  return ((direction + 1) % 4) as Direction;
}

export function positionEquals(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function cloneRobotState(robot: RobotState): RobotState {
  return {
    position: { ...robot.position },
    direction: robot.direction,
    stars: robot.stars.map((s) => ({ ...s })),
  };
}

export function createInitialRobotState(level: Level): RobotState {
  return {
    position: { ...level.start },
    direction: level.startDirection,
    stars: level.stars.map((s) => ({ ...s })),
  };
}

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

export interface ExecutionStep {
  state: ExecutionState;
  blockId?: string;
}

interface ExecuteResult {
  continue: boolean;
  returnValue?: FunctionReturnValue;
  shouldReturnFromFunction?: boolean;
}

export function generateExecutionPlan(
  level: Level,
  program: Program
): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  let state = createInitialExecutionState(level);
  state.totalSteps = estimateTotalSteps(program);

  steps.push({ state: { ...state, robot: cloneRobotState(state.robot) } });

  function evaluateCondition(
    block: ProgramBlock,
    robot: RobotState
  ): boolean {
    const forward = getForwardPosition(robot);
    switch (block.type) {
      case 'ifWall':
        return !isWalkable(level, forward);
      case 'ifStar': {
        const hasUncollected = state.robot.stars.some((s) =>
          positionEquals(s, forward)
        );
        return hasUncollected;
      }
      case 'ifEmpty':
        return isWalkable(level, forward);
      case 'ifReturnSuccess':
        return state.lastReturnValue?.success === true;
      case 'ifReturnFail':
        return state.lastReturnValue?.success === false;
      case 'ifReturnStarsGte': {
        const threshold = block.numericValue || 1;
        return (state.lastReturnValue?.starsCollected || 0) >= threshold;
      }
      default:
        return false;
    }
  }

  function createDefaultReturnValue(): FunctionReturnValue {
    return {
      success: true,
      starsCollected: state.collectedStars.length,
    };
  }

  function executeBlock(
    block: ProgramBlock,
    functions: Record<string, ProgramBlock[]>,
    depth: number = 0,
    inFunction: boolean = false
  ): ExecuteResult {
    if (depth > 100) {
      state.status = 'failed';
      state.error = '嵌套层数过深，可能存在无限循环';
      return { continue: false };
    }

    state.highlightedBlockId = block.id;
    steps.push({
      state: {
        ...state,
        robot: cloneRobotState(state.robot),
        lastReturnValue: state.lastReturnValue
          ? { ...state.lastReturnValue }
          : undefined,
      },
      blockId: block.id,
    });

    let result: ExecuteResult = { continue: true };

    switch (block.type) {
      case 'move': {
        const nextPos = getForwardPosition(state.robot);
        if (!isWalkable(level, nextPos)) {
          state.status = 'failed';
          state.error = '机器人撞到了障碍物！';
          result = { continue: false };
          break;
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
          state.status = 'failed';
          state.error = '机器人掉进了陷阱！';
          steps.push({
            state: { ...state, robot: cloneRobotState(state.robot) },
          });
          result = { continue: false };
          break;
        }
        break;
      }

      case 'turnLeft':
        state.robot.direction = turnLeft(state.robot.direction);
        state.currentStep++;
        break;

      case 'turnRight':
        state.robot.direction = turnRight(state.robot.direction);
        state.currentStep++;
        break;

      case 'loop': {
        const count = block.repeatCount || 2;
        for (let i = 0; i < count; i++) {
          if (block.children) {
            for (const child of block.children) {
              const childResult = executeBlock(child, functions, depth + 1, inFunction);
              if (!childResult.continue) {
                result = { continue: false };
                break;
              }
              if (childResult.shouldReturnFromFunction) {
                result = childResult;
                break;
              }
            }
          }
          if (!result.continue || result.shouldReturnFromFunction) break;
        }
        break;
      }

      case 'ifWall':
      case 'ifStar':
      case 'ifEmpty':
      case 'ifReturnSuccess':
      case 'ifReturnFail':
      case 'ifReturnStarsGte': {
        if (evaluateCondition(block, state.robot)) {
          if (block.children) {
            for (const child of block.children) {
              const childResult = executeBlock(child, functions, depth + 1, inFunction);
              if (!childResult.continue) {
                result = { continue: false };
                break;
              }
              if (childResult.shouldReturnFromFunction) {
                result = childResult;
                break;
              }
            }
          }
        }
        break;
      }

      case 'callFunction': {
        const funcBlocks = functions[block.functionId || 'func1'];
        if (funcBlocks) {
          let funcReturnValue: FunctionReturnValue = createDefaultReturnValue();
          let funcReturnedEarly = false;

          for (const child of funcBlocks) {
            const childResult = executeBlock(child, functions, depth + 1, true);
            if (!childResult.continue) {
              result = { continue: false };
              break;
            }
            if (childResult.shouldReturnFromFunction && childResult.returnValue) {
              funcReturnValue = childResult.returnValue;
              funcReturnedEarly = true;
              break;
            }
          }

          if (!funcReturnedEarly) {
            funcReturnValue = createDefaultReturnValue();
          }

          state.lastReturnValue = funcReturnValue;
        } else {
          state.lastReturnValue = { success: false, starsCollected: 0 };
        }
        break;
      }

      case 'returnSuccess': {
        if (inFunction) {
          result = {
            continue: true,
            shouldReturnFromFunction: true,
            returnValue: {
              success: true,
              starsCollected: state.collectedStars.length,
            },
          };
        }
        break;
      }

      case 'returnFail': {
        if (inFunction) {
          result = {
            continue: true,
            shouldReturnFromFunction: true,
            returnValue: {
              success: false,
              starsCollected: state.collectedStars.length,
            },
          };
        }
        break;
      }

      case 'returnStars': {
        if (inFunction) {
          result = {
            continue: true,
            shouldReturnFromFunction: true,
            returnValue: {
              success: true,
              starsCollected: state.collectedStars.length,
            },
          };
        }
        break;
      }

      default:
        break;
    }

    steps.push({
      state: {
        ...state,
        robot: cloneRobotState(state.robot),
        lastReturnValue: state.lastReturnValue
          ? { ...state.lastReturnValue }
          : undefined,
      },
    });
    return result;
  }

  const functions: Record<string, ProgramBlock[]> = {};
  for (const block of program.main) {
    if (block.type === 'function') {
      functions[block.functionId || 'func1'] = block.children || [];
    }
  }

  const mainBlocks = program.main.filter((b) => b.type !== 'function');

  for (const block of mainBlocks) {
    const execResult = executeBlock(block, functions, 0, false);
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

  if (!isValidPosition(level, level.start)) {
    errors.push('起点位置无效');
  }
  if (!isValidPosition(level, level.goal)) {
    errors.push('终点位置无效');
  }

  if (positionEquals(level.start, level.goal)) {
    errors.push('起点和终点不能在同一位置');
  }

  for (const star of level.stars) {
    if (!isValidPosition(level, star)) {
      errors.push('星星位置无效');
    }
    if (positionEquals(star, level.start) || positionEquals(star, level.goal)) {
      errors.push('星星不能放在起点或终点');
    }
  }

  const cell = getCellAt(level, level.start);
  if (cell === 'wall') {
    errors.push('起点不能是墙壁');
  }
  const goalCell = getCellAt(level, level.goal);
  if (goalCell === 'wall') {
    errors.push('终点不能是墙壁');
  }

  if (level.allowedBlocks.length === 0) {
    errors.push('至少允许使用一种指令块');
  }

  return errors;
}
