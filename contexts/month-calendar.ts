"use client";

import { createContext } from "react";

import type { Occurrence } from "@/lib/tasks/types";

type MonthCalendarContextValue = {
  tasks: Occurrence[];
  open: (task: Occurrence) => void;
  create: (date?: string, time?: string) => void;
};

export const MonthCalendarContext =
  createContext<MonthCalendarContextValue | null>(null);
