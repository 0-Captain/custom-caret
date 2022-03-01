import { useCallback, useEffect, useState } from "react";

let caretElement: HTMLElement;

const initialCaretStyle = {
  position: "absolute",
  zIndex: 10,
  top: 0,
  left: 0,
  height: "20px",
  width: "2px",
  transform: "translateX(-32%)",
  transformOrigin: "center",
  pointerEvents: "none",
  display: "none",
};

export function useCaret() {
  const pos = useCaretRect();
  const [caretWidth, setCaretWidth] = useState(
    parseInt(initialCaretStyle.width)
  );

  useEffect(() => {
    caretElement = document.createElement("div");
    Object.assign(caretElement.style, initialCaretStyle);
    caretElement.classList.add("custom-caret", "custom-caret-blink");
    document.body.appendChild(caretElement);

    setCaretWidth(parseInt(window.getComputedStyle(caretElement).width));

    return () => {
      document.body.removeChild(caretElement);
    };
  }, []);

  const { x, y, height, isHead, show, anchorNode } = pos;
  useEffect(() => {
    let computedHeight = height;
    let computedY = y;
    let computedX = x;
    if (isHead) {
      // 行首光标位置特殊处理
      computedX += caretWidth / 2 - 0.4;
    }
    // 根据设计稿将光标高度设为字号1.4倍
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    if (anchorElement) {
      computedHeight = parseInt(getComputedStyle(anchorElement).fontSize) * 1.4;
      computedY = y - (computedHeight - height) / 2;
    }
    Object.assign(caretElement.style, {
      top: `${computedY}px`,
      left: `${computedX}px`,
      height: `${computedHeight}px`,
      display: show ? "block" : "none",
    });

    // 通过删除再添加闪烁的类名重置闪烁动画
    caretElement.classList.remove("custom-caret-blink");
    setTimeout(() => {
      caretElement.classList.add("custom-caret-blink");
    }, 0);
  }, [x, y, height, isHead, show, anchorNode, caretWidth]);
  return pos;
}

interface CustomCaretRect {
  x: number;
  y: number;
  height: number;
  show: boolean;
  anchorNode?: Node;
  offset: number;
  isHead: boolean;
}

const initialPos = {
  x: 0,
  y: 0,
  height: 0,
  show: false,
  offset: 0,
  isHead: false,
};

/**
 * @description: 利用selectorchange事件计算光标位置，高度等信息
 * @param {string} caretSelector
 * @return {*}
 */
export function useCaretRect() {
  const [pos, setPos] = useState<CustomCaretRect>(initialPos);

  const selectionChangeHandler = useCallback(
    (e?: MouseEvent | Event) => {
      const selection = document.getSelection();
      const anchorNode = selection?.anchorNode;
      // 不处理选中的区域，只处理光标, 并且需要判断是否为可编辑元素
      if (!selection?.isCollapsed || !anchorNode || !isEditable(anchorNode)) {
        setPos(initialPos);
        return;
      }

      const offset = selection.anchorOffset;
      const range = selection.getRangeAt(0).cloneRange();
      const rects = range.getClientRects();

      if (anchorNode instanceof Text && rects.length > 0) {
        // TextNode通常可以直接获取光标位置，此时需要注意光标死区问题，如果是点击事件就选择离触点更近的rect，否则选择top值更低的rect，需要注意的是click事件和selectionchange事件的冲突，解决方案为click通过timeout延迟，保证在selectionchange之后触发，然后在selectionchange的时候如果上一次光标不存在就不处理，等待click事件中处理
        let targetRect = rects[rects.length - 1];
        if (rects.length > 1) {
          if (e instanceof MouseEvent) {
            // 处理点击时的光标位置
            setTimeout(() => {
              targetRect = getCloestRect(
                Array.from(rects),
                e.clientY - targetRect.height
              );
              const { left, top, height } = targetRect;
              setPos({
                x: left,
                y: top + window.scrollY,
                height,
                show: true,
                anchorNode,
                offset,
                isHead: offset == 0 || targetRect === rects[1],
              });
              return;
            }, 0);
          } else {
            // 处理输入时的光标位置
            if (pos.show) {
              // targetRect = getCloestRect(Array.from(rects), pos.y);
            } else {
              return;
            }
          }
        }

        const { left, top, height } = targetRect;
        setPos({
          x: left,
          y: top + window.scrollY,
          height,
          show: true,
          anchorNode,
          offset,
          isHead: offset == 0,
        });

        return;
      } else if (anchorNode instanceof Element) {
        // 如果是一个空行，anchorNode正常情况下不是TextNode，此时getClientRects返回undefined就无法拿到光标位置，直接计算行首坐标并返回就可以
        const textNode = anchorNode.childNodes[0];
        if (textNode instanceof Text) {
          // 如果空行第一次输入时，虽然有Text类型，但是anchorNode也可能还是其父元素（可能是prosemirror的副作用），所以这里手动将位置定在textNode结尾。
          const range = new Range();
          range.setStart(textNode, textNode.length);
          range.setEnd(textNode, textNode.length);
          const rect = range.getClientRects()[0];
          setPos({
            x: rect.left,
            y: rect.top + window.scrollY,
            height: rect.height,
            show: true,
            offset: offset,
            anchorNode: textNode,
            isHead: textNode.length == 0,
          });
          return;
        }
        const { x, y, height } = anchorNode.getBoundingClientRect();
        const { fontSize } = getComputedStyle(anchorNode);
        const computedCaretHeight = parseInt(fontSize) * 1.14;
        setPos({
          x: x,
          y: y + height / 2 - computedCaretHeight / 2 + window.scrollY,
          height: computedCaretHeight,
          show: true,
          offset: offset,
          anchorNode,
          isHead: true,
        });
        return;
      } else {
        setPos({
          x: 0,
          y: 0,
          height: 0,
          show: false,
          offset: offset,
          anchorNode,
          isHead: false,
        });
        console.error(selection);
        throw new Error("caret error");
      }
    },
    [pos]
  );

  const blurHandler = useCallback(() => {
    setPos(initialPos);
  }, []);

  useEffect(() => {
    document.addEventListener("click", selectionChangeHandler);
    document.addEventListener("input", selectionChangeHandler);
    document.addEventListener("selectionchange", selectionChangeHandler);
    document.addEventListener("blur", blurHandler, true);

    return () => {
      document.removeEventListener("click", selectionChangeHandler);
      document.removeEventListener("input", selectionChangeHandler);
      document.removeEventListener("selectionchange", selectionChangeHandler);
      document.removeEventListener("blur", blurHandler, true);
    };
  }, [selectionChangeHandler, blurHandler]);
  return pos;
}

const editableTag = ["input", "textarea"];

function isEditable(node: Node): boolean {
  if (node instanceof HTMLElement && node.nodeType === Node.ELEMENT_NODE) {
    if (
      node.isContentEditable ||
      editableTag.includes(node.tagName.toLowerCase())
    ) {
      return true;
    }
  }

  if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
    return isEditable(node.parentNode);
  }

  return false;
}

/**
 * @description: 获取y轴上距离target最近的rect
 * @param {*} rects
 * @param {*} target
 * @return {*}
 */
function getCloestRect(rects: DOMRect[], target: number) {
  return rects.reduce((pre, cur) => {
    return Math.abs(target - pre.top) < Math.abs(target - cur.top) ? pre : cur;
  }, rects[0]);
}
