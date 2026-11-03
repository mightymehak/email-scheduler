import { useId, useState, type KeyboardEvent } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/FormControls';
import { ApiError, errorMessage } from '../../lib/api';
import type { Sender } from '../../lib/types';
import { useCreateSender } from './useCompose';

type FieldName = 'name' | 'email' | 'password';

interface AddSenderPanelProps {
  // Pre-filled suggestion, e.g. "Ethereal sender 3"; the user can overwrite it.
  defaultName: string;
  onCreated: (sender: Omit<Sender, 'usage'>) => void;
  onCancel: () => void;
}

// Shown inline under the Sender field (not as a second modal on top of Compose).
// It sits inside the compose <form>, so it can't be a <form> itself (no nested forms):
// its buttons are type="button" and Enter is handled by hand.
export function AddSenderPanel({ defaultName, onCreated, onCancel }: AddSenderPanelProps) {
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const createSender = useCreateSender();
  const [name, setName] = useState(defaultName);
  const [useExisting, setUseExisting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    const local: Partial<Record<FieldName, string>> = {};
    if (!name.trim()) local.name = 'Name is required';
    if (useExisting && !email.trim()) local.email = 'Enter the Ethereal address';
    if (useExisting && !password) local.password = 'Enter the password';
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length > 0) return;

    createSender.mutate(
      { name: name.trim(), ...(useExisting ? { email: email.trim(), password } : {}) },
      {
        onSuccess: onCreated,
        onError: (err) => {
          if (err instanceof ApiError && err.fields) {
            setErrors({ name: err.fields.name?.[0], email: err.fields.email?.[0], password: err.fields.password?.[0] });
          } else {
            setFormError(errorMessage(err));
          }
        },
      },
    );
  };

  // Enter would otherwise submit the whole compose form.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="mt-3 space-y-4 rounded-lg bg-neutral-50 p-4 ring-1 ring-inset ring-neutral-200" onKeyDown={onKeyDown}>
      <p className="text-sm font-medium text-neutral-900">New sender</p>
      {formError && <Alert tone="error">{formError}</Alert>}

      <Field id={id('name')} label="Display name" error={errors.name} hint="Shown to recipients in the From line.">
        <TextInput id={id('name')} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} error={errors.name} autoFocus />
      </Field>

      <fieldset className="space-y-2 text-sm text-neutral-700">
        <legend className="sr-only">Ethereal account</legend>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!useExisting} onChange={() => setUseExisting(false)} className="accent-brand-500" />
          Generate a new Ethereal account for me
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={useExisting} onChange={() => setUseExisting(true)} className="accent-brand-500" />
          Use my own Ethereal account
        </label>
      </fieldset>

      {useExisting && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={id('email')}
            label="Ethereal address"
            error={errors.email}
            hint={
              <>
                Create one at{' '}
                <a href="https://ethereal.email/create" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">
                  ethereal.email
                </a>
              </>
            }
          >
            <TextInput
              id={id('email')}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@ethereal.email"
              autoComplete="off"
              error={errors.email}
            />
          </Field>
          <Field id={id('password')} label="Password" error={errors.password} hint="We test the login before saving.">
            <TextInput
              id={id('password')}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              error={errors.password}
            />
          </Field>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={createSender.isPending}>
          Cancel
        </Button>
        <Button size="sm" variant="outline" pill loading={createSender.isPending} onClick={submit}>
          {useExisting ? 'Check & add sender' : 'Create sender'}
        </Button>
      </div>
    </div>
  );
}
