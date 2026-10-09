import { daysBetween, timeToMinutes } from "@/lib/dates";
import type { Occurrence } from "@/types-and-constants/tasks";

type Segment = {
  task: Occurrence;
  start: number;
  end: number;
  lane: number;
  lanes: number;
  dayOffset: number;
};

/**
 * Places timed task occurrences into non-overlapping display lanes for one day.
 * @param tasks Task occurrences to lay out; unscheduled all-day tasks are omitted.
 * @param day Calendar date key whose timeline is being rendered.
 * @returns {Segment[]} Segments with `{ task, start, end, lane, lanes, dayOffset }`; bounds are minute offsets clipped to `0..1440` on `day`, `lane` is the zero-based column, `lanes` is the overlap-cluster column count, and `dayOffset` is the signed day difference from the schedule date. Untimed occurrences and timed occurrences that do not intersect `day` are omitted.
 * @example `layoutDay(tasks, "2026-10-01")` returns the timed segments visible on October 1.
 */
export function layoutDay(tasks: Occurrence[], day: string): Segment[] {
  const segments: Segment[] = tasks
    .flatMap((task) => {
      if (!task.schedule?.time) return [];
      const dayOffset = daysBetween(task.schedule.date, day);
      const start = timeToMinutes(task.schedule.time) - dayOffset * 1440;
      const end = start + task.schedule.duration;
      if (start >= 1440 || end <= 0) return [];
      return [
        {
          task,
          start: Math.max(0, start),
          end: Math.min(1440, end),
          lane: 0,
          lanes: 1,
          dayOffset,
        },
      ];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: Segment[] = [],
    ends: number[] = [],
    clusterEnd = -1;
  /** Assigns the lane count for the current overlapping cluster. */
  /**
   * Assigns the lane count for the current overlapping cluster.
   * @returns {void} Sets `lanes` on every segment in the current overlap cluster to the cluster's lane count.
   * @example `finish()` sets each segment's `lanes` value before the next cluster begins.
   */
  function finish() {
    for (const segment of cluster) segment.lanes = ends.length;
  }
  for (const segment of segments) {
    if (segment.start >= clusterEnd) {
      finish();
      cluster = [];
      ends = [];
      clusterEnd = -1;
    }
    let lane = ends.findIndex((end) => end <= segment.start);
    if (lane === -1) lane = ends.length;
    ends[lane] = segment.end;
    segment.lane = lane;
    cluster.push(segment);
    clusterEnd = Math.max(clusterEnd, segment.end);
  }
  finish();
  return segments;
}
