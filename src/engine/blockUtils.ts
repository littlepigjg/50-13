import { v4 as uuidv4 } from 'uuid';
import type { BlockType, ProgramBlock } from './types';

export function createBlock(type: BlockType, extras: Partial<ProgramBlock> = {}): ProgramBlock {
  const block: ProgramBlock = {
    id: uuidv4(),
    type,
    ...extras,
  };

  if (type === 'loop') {
    block.repeatCount = extras.repeatCount || 2;
    block.children = [];
  } else if (
    type === 'ifWall' ||
    type === 'ifStar' ||
    type === 'ifEmpty' ||
    type === 'function' ||
    type === 'ifReturnSuccess' ||
    type === 'ifReturnFail' ||
    type === 'ifReturnStarsGte'
  ) {
    block.children = [];
    block.elseChildren = [];
  }

  if (type === 'ifReturnStarsGte') {
    block.numericValue = extras.numericValue || 1;
  }

  if (type === 'function') {
    block.functionId = extras.functionId || 'func1';
  }

  if (type === 'callFunction') {
    block.functionId = extras.functionId || 'func1';
  }

  return block;
}

export function cloneBlock(block: ProgramBlock): ProgramBlock {
  return {
    ...block,
    id: uuidv4(),
    children: block.children ? block.children.map(cloneBlock) : undefined,
    elseChildren: block.elseChildren ? block.elseChildren.map(cloneBlock) : undefined,
  };
}

export function findBlockById(
  blocks: ProgramBlock[],
  id: string
): ProgramBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.children) {
      const found = findBlockById(block.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function removeBlockById(
  blocks: ProgramBlock[],
  id: string
): ProgramBlock[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) => ({
      ...b,
      children: b.children ? removeBlockById(b.children, id) : undefined,
      elseChildren: b.elseChildren ? removeBlockById(b.elseChildren, id) : undefined,
    }));
}

export function insertBlockAfter(
  blocks: ProgramBlock[],
  targetId: string,
  newBlock: ProgramBlock
): ProgramBlock[] {
  const result: ProgramBlock[] = [];
  for (const block of blocks) {
    result.push({
      ...block,
      children: block.children
        ? insertBlockAfter(block.children, targetId, newBlock)
        : undefined,
      elseChildren: block.elseChildren
        ? insertBlockAfter(block.elseChildren, targetId, newBlock)
        : undefined,
    });
    if (block.id === targetId) {
      result.push(newBlock);
    }
  }
  return result;
}

export function insertBlockIntoContainer(
  blocks: ProgramBlock[],
  containerId: string,
  newBlock: ProgramBlock,
  index: number = -1,
  targetElse: boolean = false
): ProgramBlock[] {
  return blocks.map((block) => {
    if (block.id === containerId) {
      if (!targetElse && block.children) {
        const newChildren = [...block.children];
        if (index >= 0 && index <= newChildren.length) {
          newChildren.splice(index, 0, newBlock);
        } else {
          newChildren.push(newBlock);
        }
        return { ...block, children: newChildren };
      }
      if (targetElse && block.elseChildren) {
        const newElseChildren = [...block.elseChildren];
        if (index >= 0 && index <= newElseChildren.length) {
          newElseChildren.splice(index, 0, newBlock);
        } else {
          newElseChildren.push(newBlock);
        }
        return { ...block, elseChildren: newElseChildren };
      }
    }
    return {
      ...block,
      children: block.children
        ? insertBlockIntoContainer(block.children, containerId, newBlock, index, targetElse)
        : undefined,
      elseChildren: block.elseChildren
        ? insertBlockIntoContainer(block.elseChildren, containerId, newBlock, index, targetElse)
        : undefined,
    };
  });
}

export function updateBlock(
  blocks: ProgramBlock[],
  id: string,
  updates: Partial<ProgramBlock>
): ProgramBlock[] {
  return blocks.map((block) => {
    if (block.id === id) {
      return { ...block, ...updates };
    }
    return {
      ...block,
      children: block.children ? updateBlock(block.children, id, updates) : undefined,
      elseChildren: block.elseChildren ? updateBlock(block.elseChildren, id, updates) : undefined,
    };
  });
}
