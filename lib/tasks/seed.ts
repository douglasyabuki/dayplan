import { addDays, dateKey } from "./dates";
import type { Task, Workspace } from "./types";

/**
 * Creates a new empty task with generated identity and creation time.
 * @param title Initial task title; defaults to an empty string.
 * @param projectId Project to assign, or `null` for the inbox.
 * @returns A task with default fields, no parent, and no date or recurrence.
 * @example `newTask("Buy milk", null)` returns a new inbox task titled `Buy milk`.
 */
export function newTask(title = "", projectId: string | null = null): Task {
  return {
    id: crypto.randomUUID(),
    title,
    description: "",
    projectId,
    sectionId: null,
    tagIds: [],
    priority: "none",
    parentId: null,
    completed: false,
    archived: false,
    order: Date.now(),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Creates a sample workspace with sections, subtasks, priorities, tags, and dates.
 * @returns A fresh workspace whose sample dates are relative to today.
 * @example `seedWorkspace()` returns a workspace with Studio, Website refresh, and Personal projects.
 */
export function seedWorkspace(): Workspace {
  const today = dateKey();
  const entries: (Partial<Task> & { children?: Partial<Task>[] })[] = [
    {
      title: "Shape the new onboarding experience",
      description:
        "Make the first five minutes feel effortless. Explore a shorter welcome flow and a more useful first-run checklist.",
      projectId: "studio",
      sectionId: "studio-in-progress",
      priority: "high",
      tagIds: ["focus"],
      deadline: { date: today },
      schedule: { date: today, time: "09:00", duration: 90 },
      children: [
        { id: "c1", title: "Sketch the welcome flow", completed: true },
        { id: "c2", title: "Explore empty states", completed: false },
        { id: "c3", title: "Share a first direction", completed: false },
      ],
    },
    {
      title: "Send the proposal to Olivia",
      projectId: "studio",
      sectionId: "studio-in-progress",
      priority: "high",
      deadline: { date: addDays(today, -1) },
      schedule: { date: today, time: "11:00", duration: 15 },
      tagIds: ["quick"],
    },
    {
      title: "A little space to read",
      projectId: "personal",
      sectionId: "personal-routines",
      priority: "low",
      tagIds: ["focus"],
      schedule: { date: today, time: "12:30", duration: 30 },
      recurrence: { frequency: "daily", weekdays: [] },
    },
    {
      title: "Review landing page copy",
      projectId: "website",
      sectionId: "website-review",
      priority: "medium",
      schedule: { date: today, time: "14:00", duration: 60 },
      deadline: { date: addDays(today, 2) },
      tagIds: ["writing", "focus"],
      children: [
        { id: "copy-headline", title: "Tighten the headline", completed: true },
        {
          id: "copy-benefits",
          title: "Clarify the benefits",
          completed: false,
        },
        { id: "copy-cta", title: "Check calls to action", completed: false },
      ],
    },
    {
      title: "Book a table for Friday",
      projectId: "personal",
      sectionId: "personal-plans",
      priority: "medium",
      deadline: { date: today, time: "17:00" },
      schedule: { date: today, time: "15:30", duration: 15 },
      tagIds: ["quick"],
    },
    {
      title: "Collect inspiration for the next release",
      projectId: "studio",
      sectionId: "studio-ideas",
      priority: "low",
      tagIds: ["someday"],
    },
    {
      title: "Try that new coffee place",
      description: "The one around the corner with the green door.",
      sectionId: "inbox-ideas",
      priority: "low",
      tagIds: ["someday"],
    },
    {
      title: "Explore a photography class",
      sectionId: "inbox-ideas",
      priority: "low",
      tagIds: ["someday", "focus"],
      children: [
        {
          id: "photo-courses",
          title: "Find beginner courses nearby",
          completed: true,
        },
        {
          id: "photo-dates",
          title: "Compare dates and prices",
          completed: false,
        },
      ],
    },
    {
      title: "Sketch an idea for a short story",
      sectionId: "inbox-ideas",
      priority: "medium",
      tagIds: ["writing", "focus"],
      schedule: { date: addDays(today, 4), time: "18:00", duration: 45 },
      deadline: { date: addDays(today, 7) },
    },
    {
      title: "Research a weekend hiking route",
      sectionId: "inbox-ideas",
      priority: "low",
      tagIds: ["someday"],
      schedule: { date: addDays(today, 2), time: "19:00", duration: 30 },
      children: [
        { id: "hike-trails", title: "Shortlist two trails", completed: false },
        {
          id: "hike-transport",
          title: "Check transport options",
          completed: false,
        },
      ],
    },
    {
      title: "Save recipes for a dinner with friends",
      sectionId: "inbox-ideas",
      priority: "none",
      tagIds: ["someday", "quick"],
      deadline: { date: addDays(today, 5) },
    },
    {
      title: "Write down ideas for the weekend",
      priority: "none",
      tagIds: ["someday"],
    },
    {
      title: "Prepare for the team catch-up",
      sectionId: "inbox-next",
      priority: "medium",
      tagIds: ["quick", "writing"],
      deadline: { date: addDays(today, 1), time: "09:30" },
      schedule: { date: addDays(today, 1), time: "09:00", duration: 20 },
      children: [
        {
          id: "catch-up-updates",
          title: "List this week's updates",
          completed: false,
        },
        {
          id: "catch-up-questions",
          title: "Note open questions",
          completed: false,
        },
      ],
    },
    {
      title: "Reply to the workshop invitation",
      sectionId: "inbox-next",
      priority: "high",
      tagIds: ["quick"],
      deadline: { date: today, time: "17:00" },
      schedule: { date: today, time: "16:00", duration: 15 },
    },
    {
      title: "Organize receipts for reimbursement",
      sectionId: "inbox-next",
      priority: "medium",
      tagIds: ["focus"],
      deadline: { date: addDays(today, 2) },
      schedule: { date: addDays(today, 1), time: "15:00", duration: 30 },
      children: [
        {
          id: "receipts-gather",
          title: "Gather this month's receipts",
          completed: true,
        },
        { id: "receipts-upload", title: "Upload scans", completed: false },
        {
          id: "receipts-submit",
          title: "Submit the expense report",
          completed: false,
        },
      ],
    },
    {
      title: "Return the library books",
      sectionId: "inbox-next",
      priority: "high",
      tagIds: ["quick"],
      deadline: { date: addDays(today, 1), time: "18:00" },
      schedule: { date: addDays(today, 1), time: "17:00", duration: 30 },
    },
    {
      title: "Sort the downloads folder",
      sectionId: "inbox-next",
      priority: "low",
      tagIds: ["quick"],
      schedule: { date: addDays(today, 2), time: "11:30", duration: 20 },
      children: [
        {
          id: "downloads-file",
          title: "File documents worth keeping",
          completed: false,
        },
        {
          id: "downloads-remove",
          title: "Remove duplicate downloads",
          completed: false,
        },
      ],
    },
    {
      title: "Design system cleanup",
      projectId: "website",
      sectionId: "website-build",
      schedule: { date: addDays(today, 1), time: "10:00", duration: 120 },
      deadline: { date: addDays(today, 4) },
      priority: "medium",
      tagIds: ["focus"],
      children: [
        {
          id: "system-audit",
          title: "Audit unused components",
          completed: true,
        },
        {
          id: "system-tokens",
          title: "Consolidate color tokens",
          completed: false,
        },
        {
          id: "system-docs",
          title: "Update component examples",
          completed: false,
        },
      ],
    },
    {
      title: "Plan the week ahead",
      projectId: "personal",
      sectionId: "personal-routines",
      priority: "medium",
      tagIds: ["focus"],
      schedule: { date: addDays(today, 3), time: "16:00", duration: 30 },
      recurrence: { frequency: "weekly", weekdays: [] },
      children: [
        { id: "week-calendar", title: "Review the calendar", completed: false },
        {
          id: "week-priorities",
          title: "Choose three priorities",
          completed: false,
        },
      ],
    },
    {
      title: "Publish the project case study",
      projectId: "website",
      sectionId: "website-review",
      deadline: { date: addDays(today, 6), time: "16:00" },
      schedule: { date: addDays(today, 5), time: "13:00", duration: 60 },
      tagIds: ["writing"],
      priority: "high",
    },
    {
      title: "Clear the desk, clear the mind",
      projectId: "personal",
      sectionId: "personal-routines",
      priority: "low",
      tagIds: ["quick"],
      completed: true,
      deadline: { date: today },
      children: [
        { id: "desk-papers", title: "File loose papers", completed: true },
        { id: "desk-surface", title: "Wipe down the desk", completed: true },
      ],
    },
  ];
  return {
    version: 2,
    sections: [
      { id: "inbox-next", name: "Next up", projectId: null, order: 0 },
      { id: "inbox-ideas", name: "Ideas", projectId: null, order: 1 },
      { id: "studio-ideas", name: "Ideas", projectId: "studio", order: 0 },
      {
        id: "studio-in-progress",
        name: "In progress",
        projectId: "studio",
        order: 1,
      },
      { id: "website-build", name: "Build", projectId: "website", order: 0 },
      { id: "website-review", name: "Review", projectId: "website", order: 1 },
      {
        id: "personal-routines",
        name: "Routines",
        projectId: "personal",
        order: 0,
      },
      { id: "personal-plans", name: "Plans", projectId: "personal", order: 1 },
    ],
    layouts: {},
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    theme: "system",
    projects: [
      { id: "studio", name: "Studio", color: "indigo" },
      { id: "website", name: "Website refresh", color: "emerald" },
      { id: "personal", name: "Personal", color: "amber" },
    ],
    tags: [
      {
        id: "focus",
        name: "Deep work",
        color: "violet",
        parentId: null,
        order: 0,
      },
      {
        id: "quick",
        name: "Quick win",
        color: "emerald",
        parentId: null,
        order: 1,
      },
      {
        id: "writing",
        name: "Writing",
        color: "sky",
        parentId: null,
        order: 2,
      },
      {
        id: "someday",
        name: "Someday",
        color: "amber",
        parentId: null,
        order: 3,
      },
    ],
    tasks: entries.flatMap(({ children = [], ...entry }, index) => {
      const parent = { ...newTask(), ...entry, order: index };
      const tasks: Task[] = [
        parent,
        ...children.map((child, order) => ({
          ...newTask(),
          ...child,
          parentId: parent.id,
          order,
        })),
      ];
      if (index === 0 && tasks[2]) {
        tasks[2].priority = "high";
        tasks[2].schedule = { date: today, time: "10:00", duration: 30 };
        tasks[2].deadline = { date: addDays(today, 1) };
        tasks.push({
          ...newTask("Try a first-time visitor flow"),
          parentId: tasks[2].id,
        });
      }
      if (parent.recurrence) {
        const child = { ...newTask("Capture a thought"), parentId: parent.id };
        const independent = {
          ...newTask("Weekly reflection"),
          parentId: parent.id,
          schedule: { date: today, duration: 30 },
          recurrence: { frequency: "weekly" as const, weekdays: [] },
        };
        tasks.push(child, independent, {
          ...newTask("Write a takeaway"),
          parentId: independent.id,
        });
      }
      return tasks;
    }),
    exceptions: {},
  };
}
