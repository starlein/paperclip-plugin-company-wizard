import { useCallback, useState } from 'react';
import {
  nextStep,
  useWizard,
  useWizardDispatch,
  type WizardProject,
} from '../../context/WizardContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import { Check, GitBranch, Github, PlusCircle } from 'lucide-react';
import {
  type RepositoryMode,
  getRepositoryMode,
  getRepositoryRef,
  getRepositoryUrl,
  repositoryProjectFields,
} from '../../lib/repository';

function getPrimaryProject(stateProjects: WizardProject[]): WizardProject | null {
  return stateProjects.length > 0 ? stateProjects[0] : null;
}

function buildProject({
  existing,
  companyName,
  goalTitles,
  goalDescription,
  mode,
  repoUrl,
  repoRef,
}: {
  existing: WizardProject | null;
  companyName: string;
  goalTitles: string[];
  goalDescription: string;
  mode: RepositoryMode;
  repoUrl: string;
  repoRef: string;
}): WizardProject {
  const name = existing?.name?.trim() || companyName || 'Main Project';
  const description =
    existing?.description?.trim() || goalDescription || `Main project for ${companyName}`;
  const goals = existing?.goals?.length ? existing.goals : goalTitles;

  return {
    ...(existing ?? {}),
    name,
    description,
    goals,
    ...repositoryProjectFields(mode, repoUrl, repoRef),
  };
}

function ModeCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-4 rounded-lg border p-4 text-left transition-all duration-150',
        selected
          ? 'border-foreground/30 bg-accent'
          : 'border-border hover:border-foreground/15 hover:bg-accent/50',
      )}
    >
      <div
        className={cn(
          'mt-0.5 h-8 w-8 rounded-md flex items-center justify-center shrink-0',
          selected ? 'bg-foreground text-background' : 'bg-secondary',
        )}
      >
        {selected ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function StepRepository() {
  const state = useWizard();
  const dispatch = useWizardDispatch();
  const existingProject = getPrimaryProject(state.projects);
  const initialMode = getRepositoryMode(existingProject);
  const [mode, setMode] = useState<RepositoryMode>(initialMode);
  const [repoUrl, setRepoUrl] = useState(getRepositoryUrl(existingProject));
  const [repoRef, setRepoRef] = useState(getRepositoryRef(existingProject, initialMode));

  const companyName = state.companyName.trim() || 'Company';
  const goalTitles = state.goals.map((g) => g.title).filter(Boolean);
  const goalDescription = state.goals[0]?.description || '';
  const externalRepoMissing = mode === 'external' && !repoUrl.trim();

  const chooseMode = (nextMode: RepositoryMode) => {
    setMode(nextMode);
    if (nextMode === 'new' && (!repoRef.trim() || repoRef.trim().startsWith('origin/'))) {
      setRepoRef('main');
    }
  };

  const handleNext = useCallback(() => {
    if (externalRepoMissing) return;
    const updatedProject = buildProject({
      existing: existingProject,
      companyName,
      goalTitles,
      goalDescription,
      mode,
      repoUrl,
      repoRef,
    });
    dispatch({ type: 'SET_PROJECTS', projects: [updatedProject, ...state.projects.slice(1)] });
    dispatch({ type: 'GO_TO', step: nextStep(state) });
  }, [
    companyName,
    dispatch,
    existingProject,
    externalRepoMissing,
    goalDescription,
    goalTitles,
    mode,
    repoRef,
    repoUrl,
    state,
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Repository setup</h2>
        <p className="text-sm text-muted-foreground">
          Should Paperclip create a fresh Git repository for this project, or should the agents work
          from an existing external repository such as GitHub?
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          icon={PlusCircle}
          title="Create a new Git repository"
          description="Start with a fresh local project workspace. Paperclip will initialize Git during bootstrap."
          selected={mode === 'new'}
          onClick={() => chooseMode('new')}
        />
        <ModeCard
          icon={Github}
          title="Use an external repository"
          description="Connect an existing GitHub, GitLab, or other remote Git repository."
          selected={mode === 'external'}
          onClick={() => chooseMode('external')}
        />
      </div>

      {mode === 'external' ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Repository URL</label>
            <Input
              placeholder="https://github.com/org/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Do not paste tokens or credentials into the URL. Configure provider access as
              Paperclip company secrets instead.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Default ref <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              placeholder="Leave blank to use Paperclip/project default, or enter an explicit ref"
              value={repoRef}
              onChange={(e) => setRepoRef(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <GitBranch className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Fresh repository workspace</p>
              <p className="text-sm text-muted-foreground">
                The bootstrap will create project "{existingProject?.name || companyName}" with a
                local workspace and run{' '}
                <code className="bg-muted px-1 py-0.5 rounded">git init</code>.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Initial branch <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              placeholder="main"
              value={repoRef}
              onChange={(e) => setRepoRef(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNext()}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={externalRepoMissing}>
          Continue
        </Button>
      </div>
    </div>
  );
}
