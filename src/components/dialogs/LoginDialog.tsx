import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LoginDialogProps {
  /* Common */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the dialog opens, choose which tab is active first */
  initialTab?: "login" | "signup";

  /* Login fields */
  usernameInput: string;
  onUsernameInputChange: (value: string) => void;
  passwordInput: string;
  onPasswordInputChange: (value: string) => void;
  onLoginSubmit: () => Promise<void>;
  isLoginLoading: boolean;
  loginError: string | null;

  /* Sign-up fields */
  newUsername: string;
  onNewUsernameChange: (value: string) => void;
  newPassword: string;
  onNewPasswordChange: (value: string) => void;
  onSignUpSubmit: () => Promise<void>;
  isSignUpLoading: boolean;
  signUpError: string | null;
}

export function LoginDialog({
  isOpen,
  onOpenChange,
  initialTab = "login",
  /* Login props */
  usernameInput,
  onUsernameInputChange,
  passwordInput,
  onPasswordInputChange,
  onLoginSubmit,
  isLoginLoading,
  loginError,
  /* Sign-up props */
  newUsername,
  onNewUsernameChange,
  newPassword,
  onNewPasswordChange,
  onSignUpSubmit,
  isSignUpLoading,
  signUpError,
}: LoginDialogProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">(initialTab);

  // Reset to the initial tab whenever the dialog is reopened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  /* Handlers */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (activeTab === "login") {
      if (!isLoginLoading) {
        await onLoginSubmit();
      }
    } else {
      if (!isSignUpLoading) {
        await onSignUpSubmit();
      }
    }
  };

  const renderLoginForm = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-gray-700 text-[12px] font-geneva-12">
          Username
        </Label>
        <Input
          autoFocus={activeTab === "login"}
          value={usernameInput}
          onChange={(e) => onUsernameInputChange(e.target.value)}
          className="shadow-none font-geneva-12 text-[12px] h-8"
          disabled={isLoginLoading}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-gray-700 text-[12px] font-geneva-12">
          Password
        </Label>
        <Input
          type="password"
          value={passwordInput}
          onChange={(e) => onPasswordInputChange(e.target.value)}
          className="shadow-none font-geneva-12 text-[12px] h-8"
          disabled={isLoginLoading}
        />
      </div>
    </div>
  );

  const renderSignUpForm = () => (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-gray-700 text-[12px] font-geneva-12">
          Username
        </Label>
        <Input
          autoFocus={activeTab === "signup"}
          value={newUsername}
          onChange={(e) => onNewUsernameChange(e.target.value)}
          className="shadow-none font-geneva-12 text-[12px] h-8"
          disabled={isSignUpLoading}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-gray-700 text-[12px] font-geneva-12">
          Password (optional)
        </Label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => onNewPasswordChange(e.target.value)}
          className="shadow-none font-geneva-12 text-[12px] h-8"
          disabled={isSignUpLoading}
        />
      </div>
    </div>
  );

  const isActionLoading =
    activeTab === "login" ? isLoginLoading : isSignUpLoading;
  const activeError = activeTab === "login" ? loginError : signUpError;

  // Automatically close the dialog when an action completes successfully
  const prevLoginLoading = React.useRef(isLoginLoading);
  const prevSignUpLoading = React.useRef(isSignUpLoading);

  React.useEffect(() => {
    // Detect transition from loading -> not loading with no errors
    const loginFinishedSuccessfully =
      prevLoginLoading.current &&
      !isLoginLoading &&
      !loginError &&
      activeTab === "login";

    const signUpFinishedSuccessfully =
      prevSignUpLoading.current &&
      !isSignUpLoading &&
      !signUpError &&
      activeTab === "signup";

    if (isOpen && (loginFinishedSuccessfully || signUpFinishedSuccessfully)) {
      onOpenChange(false);
    }

    prevLoginLoading.current = isLoginLoading;
    prevSignUpLoading.current = isSignUpLoading;
  }, [
    isOpen,
    isLoginLoading,
    isSignUpLoading,
    loginError,
    signUpError,
    activeTab,
    onOpenChange,
  ]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-system7-window-bg border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] max-w-[400px]"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">
            ryOS Login
          </DialogTitle>
          <DialogDescription className="sr-only">
            {activeTab === "login"
              ? "Log in to your account"
              : "Create an account to access chat rooms and save your settings"}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-1 pb-6 px-6">
          <form onSubmit={handleSubmit}>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "login" | "signup")}
              className="w-full"
            >
              <TabsList className="grid grid-cols-2 w-full h-fit mb-4 bg-transparent p-0.5 border border-black">
                <TabsTrigger
                  value="signup"
                  className="relative font-geneva-12 text-[12px] px-4 py-1.5 rounded-none bg-white data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10 data-[state=inactive]:border-r-0"
                >
                  Create Account
                </TabsTrigger>
                <TabsTrigger
                  value="login"
                  className="relative font-geneva-12 text-[12px] px-4 py-1.5 rounded-none bg-white data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:z-10"
                >
                  Log In
                </TabsTrigger>
              </TabsList>

              {/* Sign Up */}
              <TabsContent value="signup" className="mt-0">
                {renderSignUpForm()}
              </TabsContent>

              {/* Login */}
              <TabsContent value="login" className="mt-0">
                {renderLoginForm()}
              </TabsContent>
            </Tabs>

            {activeError && (
              <p className="text-red-600 text-[12px] font-geneva-12 mt-3">
                {activeError}
              </p>
            )}

            <DialogFooter className="mt-6 gap-2 sm:justify-end">
              <Button
                type="submit"
                variant="retro"
                disabled={
                  isActionLoading ||
                  (activeTab === "login"
                    ? !usernameInput.trim() || !passwordInput.trim()
                    : !newUsername.trim())
                }
                className="w-full sm:w-auto"
              >
                {isActionLoading
                  ? activeTab === "login"
                    ? "Logging in..."
                    : "Creating..."
                  : activeTab === "login"
                  ? "Log In"
                  : "Create Account"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
