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
