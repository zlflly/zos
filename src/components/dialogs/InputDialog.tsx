import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface InputDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => void;
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  // Additional actions support
  additionalActions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "retro" | "destructive";
    position?: "left" | "right";
  }>;
  submitLabel?: string;
  showCancel?: boolean;
}

export function InputDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  title,
  description,
  value,
  onChange,
  isLoading = false,
  errorMessage = null,
  additionalActions = [],
  submitLabel = "Save",
  showCancel = true,
}: InputDialogProps) {
  const handleSubmit = () => {
    if (!isLoading) {
      onSubmit(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-system7-window-bg border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 px-6">
          <p
            className="text-gray-500 mb-2 text-[12px] font-geneva-12"
            id="dialog-description"
          >
            {description}
          </p>
          <Input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !isLoading) {
                handleSubmit();
              }
            }}
            className="shadow-none font-geneva-12 text-[12px]"
            disabled={isLoading}
          />
          {errorMessage && (
            <p className="text-red-600 text-sm mt-1">{errorMessage}</p>
          )}
          <DialogFooter className="mt-4 gap-2 sm:justify-between">
            <div className="flex gap-2 w-full sm:w-auto">
              {additionalActions
                .filter((action) => action.position === "left")
                .map((action, index) => (
                  <Button
                    key={`left-${index}`}
                    variant={action.variant || "retro"}
                    onClick={action.onClick}
                    disabled={isLoading}
                    className="w-full sm:w-auto"
                  >
                    {action.label}
                  </Button>
                ))}
            </div>
            <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row">
              {additionalActions
                .filter((action) => action.position !== "left")
                .map((action, index) => (
                  <Button
                    key={`right-${index}`}
                    variant={action.variant || "retro"}
                    onClick={action.onClick}
                    disabled={isLoading}
                    className="w-full sm:w-auto"
                  >
                    {action.label}
                  </Button>
                ))}
              {showCancel && (
                <Button
                  variant="retro"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              )}
              <Button
                variant="retro"
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? "Adding..." : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
