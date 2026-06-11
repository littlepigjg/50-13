import type {
  CellType,
  Direction,
  Level,
  Position,
  RobotState,
} from './types';
import { DirectionVectors } from './types';

export function createEmptyGrid(width: number, height: number): CellType[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'empty' as CellType)
  );
}

export function isValidPosition(level: Level, pos: Position): boolean {
  return (
    pos.x >= 0 &&
    pos.x < level.width &&
    pos.y >= 0 &&
    pos.y < level.height
  );
}

export function isWalkable(level: Level, pos: Position): boolean {
  if (!isValidPosition(level, pos)) return false;
  const cell = level.grid[pos.y][pos.x];
  return cell !== 'wall';
}

export function getCellAt(level: Level, pos: Position): CellType | null {
  if (!isValidPosition(level, pos)) return null;
  return level.grid[pos.y][pos.x];
}

export function getForwardPosition(robot: RobotState): Position {
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
