import { describe, it, expect } from 'vitest';
import type {
  CellType,
  Direction,
  Level,
  Program,
  ProgramBlock,
} from './types';
import { generateExecutionPlan } from './GameEngine';

function makeLevel(overrides: Partial<Level> = {}): Level {
  const grid: CellType[][] = [
    ['empty', 'empty', 'empty', 'empty'],
    ['empty', 'empty', 'empty', 'empty'],
    ['empty', 'empty', 'empty', 'empty'],
    ['empty', 'empty', 'empty', 'empty'],
  ];
  return {
    id: 'test',
    name: '测试关卡',
    description: '',
    difficulty: 1,
    width: 4,
    height: 4,
    grid,
    start: { x: 0, y: 0 },
    startDirection: 1 as Direction,
    goal: { x: 3, y: 0 },
    stars: [],
    allowedBlocks: [
      'move', 'turnLeft', 'turnRight', 'loop',
      'ifWall', 'ifStar', 'ifEmpty',
      'function', 'callFunction',
      'returnSuccess', 'returnFail', 'returnStars',
      'ifReturnSuccess', 'ifReturnFail', 'ifReturnStarsGte',
    ],
    ...overrides,
  };
}

function makeBlock(
  type: ProgramBlock['type'],
  overrides: Partial<ProgramBlock> = {}
): ProgramBlock {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    ...overrides,
  };
}

function getFinalState(level: Level, program: Program) {
  const steps = generateExecutionPlan(level, program);
  return steps[steps.length - 1].state;
}

function hasBlockInSteps(steps: ReturnType<typeof generateExecutionPlan>, blockId: string): boolean {
  return steps.some((s) => s.blockId === blockId);
}

describe('函数返回值 - 基础场景', () => {
  it('函数没有显式返回块时，默认返回 success=true', () => {
    const level = makeLevel();
    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('turnLeft')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock],
      functions: {},
    };

    const finalState = getFinalState(level, program);
    expect(finalState.lastReturnValue).toBeDefined();
    expect(finalState.lastReturnValue!.success).toBe(true);
  });

  it('函数包含 returnSuccess 块时，返回 success=true', () => {
    const level = makeLevel();
    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock],
      functions: {},
    };

    const finalState = getFinalState(level, program);
    expect(finalState.lastReturnValue).toBeDefined();
    expect(finalState.lastReturnValue!.success).toBe(true);
  });

  it('函数包含 returnFail 块时，返回 success=false', () => {
    const level = makeLevel();
    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock],
      functions: {},
    };

    const finalState = getFinalState(level, program);
    expect(finalState.lastReturnValue).toBeDefined();
    expect(finalState.lastReturnValue!.success).toBe(false);
  });

  it('函数包含 returnStars 块时，返回 success=true 和收集的星星数', () => {
    const level = makeLevel({
      stars: [{ x: 1, y: 0 }],
    });
    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [
        makeBlock('move'),
        makeBlock('returnStars'),
      ],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock],
      functions: {},
    };

    const finalState = getFinalState(level, program);
    expect(finalState.lastReturnValue).toBeDefined();
    expect(finalState.lastReturnValue!.success).toBe(true);
    expect(finalState.lastReturnValue!.starsCollected).toBe(1);
  });
});

describe('函数内撞墙 - 错误转化为返回值', () => {
  it('函数内撞墙不终止主程序，返回 success=false', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('move')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock],
      functions: {},
    };

    const finalState = getFinalState(level, program);
    expect(finalState.lastReturnValue).toBeDefined();
    expect(finalState.lastReturnValue!.success).toBe(false);
  });

  it('函数内撞墙后状态回滚，机器人位置不变', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('move')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock],
      functions: {},
    };

    const finalState = getFinalState(level, program);
    expect(finalState.robot.position).toEqual({ x: 0, y: 0 });
  });

  it('函数内撞墙后主程序继续执行后续块', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });

    const turnRightBlock = makeBlock('turnRight');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('move')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock, turnRightBlock],
      functions: {},
    };

    const finalState = getFinalState(level, program);
    expect(finalState.lastReturnValue!.success).toBe(false);
    expect(finalState.robot.direction).toBe(2);
  });
});

describe('ifReturnSuccess - 根据返回值控制子块执行', () => {
  it('函数返回成功时，ifReturnSuccess 内的子块执行', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(true);
  });

  it('函数返回失败时，ifReturnSuccess 内的子块不执行', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
  });

  it('函数撞墙返回失败时，ifReturnSuccess 内的子块不执行', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });
    const moveBlock = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('move')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
  });
});

describe('ifReturnFail - 根据返回值控制子块执行', () => {
  it('函数返回失败时，ifReturnFail 内的子块执行', () => {
    const level = makeLevel();
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifFailBlock = makeBlock('ifReturnFail', {
      children: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifFailBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
  });

  it('函数返回成功时，ifReturnFail 内的子块不执行', () => {
    const level = makeLevel();
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifFailBlock = makeBlock('ifReturnFail', {
      children: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifFailBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(false);
  });

  it('函数撞墙返回失败时，ifReturnFail 内的子块执行', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('move')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifFailBlock = makeBlock('ifReturnFail', {
      children: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifFailBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
  });
});

describe('核心场景：如果返回成功就前进，失败就左转', () => {
  it('返回成功时：前进执行，左转不执行', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
    });
    const ifFailBlock = makeBlock('ifReturnFail', {
      children: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock, ifFailBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(true);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(false);
    expect(finalState.robot.position).toEqual({ x: 1, y: 0 });
    expect(finalState.robot.direction).toBe(1);
  });

  it('返回失败时：前进不执行，左转执行', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
    });
    const ifFailBlock = makeBlock('ifReturnFail', {
      children: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock, ifFailBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
    expect(finalState.robot.position).toEqual({ x: 0, y: 0 });
    expect(finalState.robot.direction).toBe(0);
  });

  it('函数撞墙返回失败时：前进不执行，左转执行，机器人位置不变', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('move')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
    });
    const ifFailBlock = makeBlock('ifReturnFail', {
      children: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock, ifFailBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(finalState.lastReturnValue!.success).toBe(false);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
    expect(finalState.robot.position).toEqual({ x: 0, y: 0 });
    expect(finalState.robot.direction).toBe(0);
  });
});

describe('ifReturnStarsGte - 根据星星数量判断', () => {
  it('收集的星星数 >= 阈值时，子块执行', () => {
    const level = makeLevel({
      stars: [{ x: 1, y: 0 }],
    });
    const moveBlock = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [
        makeBlock('move'),
        makeBlock('returnStars'),
      ],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifStarsBlock = makeBlock('ifReturnStarsGte', {
      numericValue: 1,
      children: [moveBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifStarsBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(true);
  });

  it('收集的星星数 < 阈值时，子块不执行', () => {
    const level = makeLevel({
      stars: [{ x: 1, y: 0 }],
    });
    const moveBlock = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [
        makeBlock('move'),
        makeBlock('returnStars'),
      ],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifStarsBlock = makeBlock('ifReturnStarsGte', {
      numericValue: 5,
      children: [moveBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifStarsBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
  });
});

describe('返回值在执行步骤中正确传递', () => {
  it('每个执行步骤都携带正确的 lastReturnValue', () => {
    const level = makeLevel();

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifFailBlock = makeBlock('ifReturnFail', {
      children: [makeBlock('turnLeft')],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifFailBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);

    const callStepIndex = steps.findIndex((s) => s.blockId === callBlock.id);
    expect(callStepIndex).toBeGreaterThanOrEqual(0);

    const afterCall = steps.find((s, i) => i > callStepIndex && s.state.lastReturnValue?.success === false);
    expect(afterCall).toBeDefined();
    expect(afterCall!.state.lastReturnValue!.success).toBe(false);
  });
});

describe('函数内提前返回', () => {
  it('遇到 returnSuccess 后，函数后续块不执行', () => {
    const level = makeLevel();
    const moveAfterReturn = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [
        makeBlock('returnSuccess'),
        moveAfterReturn,
      ],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveAfterReturn.id)).toBe(false);
  });

  it('遇到 returnFail 后，函数后续块不执行', () => {
    const level = makeLevel();
    const moveAfterReturn = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [
        makeBlock('returnFail'),
        moveAfterReturn,
      ],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });

    const program: Program = {
      main: [funcBlock, callBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveAfterReturn.id)).toBe(false);
  });
});

describe('连续多次函数调用', () => {
  it('每次函数调用更新 lastReturnValue', () => {
    const level = makeLevel();

    const funcSuccess = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const funcFail = makeBlock('function', {
      functionId: 'func2',
      children: [makeBlock('returnFail')],
    });

    const call1 = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccess1 = makeBlock('ifReturnSuccess', {
      children: [makeBlock('turnLeft')],
    });
    const call2 = makeBlock('callFunction', { functionId: 'func2' });
    const ifFail2 = makeBlock('ifReturnFail', {
      children: [makeBlock('turnRight')],
    });

    const program: Program = {
      main: [funcSuccess, funcFail, call1, ifSuccess1, call2, ifFail2],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(finalState.lastReturnValue!.success).toBe(false);
    expect(finalState.robot.direction).toBe(1);
  });
});

describe('返回值条件块在循环中', () => {
  it('循环内调用函数后根据返回值控制子块', () => {
    const level = makeLevel();

    const moveInIf = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveInIf],
    });
    const loopBlock = makeBlock('loop', {
      repeatCount: 1,
      children: [callBlock, ifSuccessBlock],
    });

    const program: Program = {
      main: [funcBlock, loopBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveInIf.id)).toBe(true);
  });
});

describe('else 分支 - 条件为 false 时执行 elseChildren', () => {
  it('ifReturnSuccess 条件为 true 时执行 children，不执行 elseChildren', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(true);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(false);
  });

  it('ifReturnSuccess 条件为 false 时执行 elseChildren，不执行 children', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
  });

  it('ifReturnFail 条件为 true 时执行 children，条件为 false 时执行 elseChildren', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcSuccess = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const callSuccess = makeBlock('callFunction', { functionId: 'func1' });
    const ifFailWithElse = makeBlock('ifReturnFail', {
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcSuccess, callSuccess, ifFailWithElse],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
  });

  it('ifReturnStarsGte 条件为 true 时执行 children，为 false 时执行 elseChildren', () => {
    const level = makeLevel({
      stars: [{ x: 1, y: 0 }],
    });
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('move'), makeBlock('returnStars')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifStarsBlock = makeBlock('ifReturnStarsGte', {
      numericValue: 5,
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifStarsBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
  });
});

describe('else 分支 - 核心场景：成功就前进，失败就左转（使用 else）', () => {
  it('使用单个 ifReturnSuccess+else 实现：成功前进，失败左转', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnSuccess')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(true);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(false);
    expect(finalState.robot.position).toEqual({ x: 1, y: 0 });
    expect(finalState.robot.direction).toBe(1);
  });

  it('使用单个 ifReturnSuccess+else 实现：成功前进，失败左转（失败路径）', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
    expect(finalState.robot.position).toEqual({ x: 0, y: 0 });
    expect(finalState.robot.direction).toBe(0);
  });

  it('撞墙失败后：else 分支左转执行，前进不执行', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('move')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifBlock = makeBlock('ifReturnSuccess', {
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(finalState.lastReturnValue!.success).toBe(false);
    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
    expect(finalState.robot.position).toEqual({ x: 0, y: 0 });
    expect(finalState.robot.direction).toBe(0);
  });
});

describe('else 分支 - ifWall/ifStar/ifEmpty 也支持 else', () => {
  it('ifWall 前方无墙时执行 elseChildren', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const ifWallBlock = makeBlock('ifWall', {
      children: [turnLeftBlock],
      elseChildren: [moveBlock],
    });

    const program: Program = {
      main: [ifWallBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(true);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(false);
    expect(finalState.robot.position).toEqual({ x: 1, y: 0 });
  });

  it('ifWall 前方有墙时不执行 elseChildren', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const ifWallBlock = makeBlock('ifWall', {
      children: [turnLeftBlock],
      elseChildren: [moveBlock],
    });

    const program: Program = {
      main: [ifWallBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
    expect(finalState.robot.direction).toBe(0);
  });

  it('ifStar 前方无星时执行 elseChildren', () => {
    const level = makeLevel();
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const ifStarBlock = makeBlock('ifStar', {
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [ifStarBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
    expect(finalState.robot.direction).toBe(0);
  });

  it('ifEmpty 前方是空时执行 children，不是空时执行 elseChildren', () => {
    const grid: CellType[][] = [
      ['empty', 'wall', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
      ['empty', 'empty', 'empty', 'empty'],
    ];
    const level = makeLevel({ grid });
    const moveBlock = makeBlock('move');
    const turnLeftBlock = makeBlock('turnLeft');

    const ifEmptyBlock = makeBlock('ifEmpty', {
      children: [moveBlock],
      elseChildren: [turnLeftBlock],
    });

    const program: Program = {
      main: [ifEmptyBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(hasBlockInSteps(steps, moveBlock.id)).toBe(false);
    expect(hasBlockInSteps(steps, turnLeftBlock.id)).toBe(true);
  });
});

describe('else 分支 - 空 elseChildren 不影响执行', () => {
  it('条件为 false 且 elseChildren 为空时，程序正常继续', () => {
    const level = makeLevel();
    const moveAfter = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [makeBlock('turnLeft')],
      elseChildren: [],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock, moveAfter],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(finalState.robot.position).toEqual({ x: 1, y: 0 });
  });

  it('条件为 false 且没有 elseChildren 时，程序正常继续', () => {
    const level = makeLevel();
    const moveAfter = makeBlock('move');

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifSuccessBlock = makeBlock('ifReturnSuccess', {
      children: [makeBlock('turnLeft')],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifSuccessBlock, moveAfter],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(finalState.robot.position).toEqual({ x: 1, y: 0 });
  });
});

describe('else 分支 - elseChildren 中多个块按顺序执行', () => {
  it('elseChildren 中有多个块时全部执行', () => {
    const level = makeLevel();

    const funcBlock = makeBlock('function', {
      functionId: 'func1',
      children: [makeBlock('returnFail')],
    });
    const callBlock = makeBlock('callFunction', { functionId: 'func1' });
    const ifBlock = makeBlock('ifReturnSuccess', {
      children: [makeBlock('move')],
      elseChildren: [makeBlock('turnRight'), makeBlock('move')],
    });

    const program: Program = {
      main: [funcBlock, callBlock, ifBlock],
      functions: {},
    };

    const steps = generateExecutionPlan(level, program);
    const finalState = steps[steps.length - 1].state;

    expect(finalState.robot.direction).toBe(2);
    expect(finalState.robot.position).toEqual({ x: 0, y: 1 });
  });
});
