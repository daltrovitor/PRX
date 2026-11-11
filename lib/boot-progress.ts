export type BootTask = { ready: boolean; error?: string | null };

export function summarizeBootTasks(tasks: Record<string, BootTask>) {
  const list = Object.values(tasks);
  const ready = list.length > 0 && list.every((task) => task.ready && !task.error);
  const completed = list.filter((task) => task.ready && !task.error).length;
  return { ready, percent: list.length ? Math.floor(completed / list.length * 100) : 0, error: list.find((task) => task.error)?.error ?? undefined };
}
