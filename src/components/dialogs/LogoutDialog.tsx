import { ConfirmDialog } from "./ConfirmDialog";

interface LogoutDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  hasPassword?: boolean | null;
  onSetPassword?: () => void;
}

export function LogoutDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  hasPassword,
  onSetPassword,
}: LogoutDialogProps) {
  // If user doesn't have a password set, show password requirement dialog
  if (hasPassword === false) {
    return (
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onConfirm={() => {
          onOpenChange(false);
          onSetPassword?.();
        }}
        title="Set Password Required"
        description="You need to set a password before logging out to ensure you can recover your account. Would you like to set a password now?"
      />
    );
  }

  // Normal logout confirmation
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="Log Out"
      description="Are you sure you want to log out? You will be signed out of your account."
    />
  );
}
