import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

// "Are you sure?" on top of the reusable Modal; replaces the browser's unstyled confirm().
export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel, loading = false }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      dismissible={!loading}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-neutral-600">{message}</p>
    </Modal>
  );
}
