export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export function fieldError(state: ActionState, name: string): string | undefined {
  return state.fieldErrors?.[name];
}
