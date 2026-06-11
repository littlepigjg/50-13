import type { ExecutionState, Level, ProgramBlock, RobotState } from './types';
import { isWalkable, getForwardPosition, positionEquals } from './gridUtils';

export interface ConditionContext {
  level: Level;
  robot: RobotState;
  state: ExecutionState;
}

export function evaluateCondition(
  block: ProgramBlock,
  ctx: ConditionContext
): boolean {
  const { level, robot, state } = ctx;
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
