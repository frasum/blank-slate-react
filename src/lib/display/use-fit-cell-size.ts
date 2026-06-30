import { useEffect, useState, type RefObject } from "react";

const LEFT_NAME = 96;
const RIGHT_NAME = 80;
const SUM_COL = 48;
const MIN_CELL = 28;

export interface FitCellSizeResult {
  cellSize: number;
  leftNameWidth: number;
  rightNameWidth: number;
  sumColWidth: number;
  showRightName: boolean;
}

export function useFitCellSize(
  containerRef: RefObject<HTMLDivElement | null>,
  daysCount: number,
): FitCellSizeResult {
  const [result, setResult] = useState<FitCellSizeResult>({
    cellSize: MIN_CELL,
    leftNameWidth: LEFT_NAME,
    rightNameWidth: RIGHT_NAME,
    sumColWidth: SUM_COL,
    showRightName: true,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || daysCount <= 0) return;

    const calc = () => {
      const w = el.clientWidth;
      // Try with right name column first
      let avail = w - LEFT_NAME - RIGHT_NAME - SUM_COL;
      let cell = Math.max(MIN_CELL, Math.floor(avail / daysCount));
      let showRight = LEFT_NAME + RIGHT_NAME + SUM_COL + cell * daysCount <= w;

      if (!showRight) {
        // Drop right name column to gain space
        avail = w - LEFT_NAME - SUM_COL;
        cell = Math.max(MIN_CELL, Math.floor(avail / daysCount));
      }

      setResult({
        cellSize: cell,
        leftNameWidth: LEFT_NAME,
        rightNameWidth: showRight ? RIGHT_NAME : 0,
        sumColWidth: SUM_COL,
        showRightName: showRight,
      });
    };

    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    window.addEventListener("resize", calc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calc);
    };
  }, [containerRef, daysCount]);

  return result;
}
