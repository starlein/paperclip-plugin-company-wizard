export interface SubGoal {
  id: string;
  title: string;
  level?: 'company' | 'team' | 'agent' | 'task';
  description?: string;
}

export interface InlineGoal {
  title: string;
  description: string;
  subgoals?: SubGoal[];
  [key: string]: unknown;
}

export function loadPresets(templatesDir: string): Promise<any[]>;

export function loadModules(templatesDir: string): Promise<any[]>;

export function loadRoles(templatesDir: string): Promise<any[]>;

export function collectGoals(
  preset: any,
  modules: any[],
  selectedModules: Set<string>,
): InlineGoal[];

export function resolveEffectiveModules(
  preset: any,
  modules: any[],
  selectedModules: string[] | Set<string>,
): string[];

export function collectPresetBootstrapData(preset: any): {
  labels: any[];
  issues: any[];
  routines: any[];
};

export function validateGoal(goal: InlineGoal, sourceName: string): void;
export function validateGoalTemplate(goal: InlineGoal, sourceName: string): void;
