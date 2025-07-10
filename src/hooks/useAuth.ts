import { useState, useCallback } from "react";
import { toast } from "sonner";

export function useAuth() {
  // All chat-related authentication logic is removed.
  // This hook now provides placeholder values or no-op functions.
  const username = "";
  const authToken = "";
  const hasPassword = false;
  // const setAuthToken = () => {}; // Unused
  // const setUsername = () => {}; // Unused
  // const createUser = async () => ({ ok: false, error: "Authentication feature removed" }); // Unused
  const logout = async () => {};
  const storeCheckHasPassword = async () => false;
  const storeSetPassword = async () => ({ ok: false, error: "Authentication feature removed" });

  // Set username dialog states
  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSettingUsername, setIsSettingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Token verification dialog states
  const [isVerifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyTokenInput, setVerifyTokenInput] = useState("");
  const [verifyPasswordInput, setVerifyPasswordInput] = useState("");
  const [verifyUsernameInput, setVerifyUsernameInput] = useState("");
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Password state is now managed by the store

  // Logout confirmation dialog state
  const [isLogoutConfirmDialogOpen, setIsLogoutConfirmDialogOpen] =
    useState(false);

  // Username management
  const promptSetUsername = useCallback(() => {
    setNewUsername("");
    setNewPassword("");
    setUsernameError(null);
    setIsUsernameDialogOpen(true);
  }, []);

  const submitUsernameDialog = useCallback(async () => {
    setIsSettingUsername(true);
    setUsernameError(null);

    const trimmedUsername = newUsername.trim();
    if (!trimmedUsername) {
      setUsernameError("Username cannot be empty.");
      setIsSettingUsername(false);
      return;
    }

    toast.error("Authentication feature removed.");
    setIsSettingUsername(false);
  }, [newUsername, newPassword]);

  // Token verification management
  const promptVerifyToken = useCallback(() => {
    setVerifyTokenInput("");
    setVerifyPasswordInput("");
    setVerifyUsernameInput(username || "");
    setVerifyError(null);
    setVerifyDialogOpen(true);
  }, [username]);

  const handleVerifyTokenSubmit = useCallback(
    async (_input: string, _isPassword: boolean = false) => {
      toast.error("Authentication feature removed.");
      setIsVerifyingToken(false);
    }, [username, authToken]);

  // Check if user has a password set (now uses store)
  const checkHasPassword = useCallback(async () => {
    return storeCheckHasPassword();
  }, [storeCheckHasPassword]);

  // Set password for existing user (now uses store)
  const setPassword = useCallback(
    async (password: string) => {
      return storeSetPassword(password);
    },
    [storeSetPassword]
  );

  // Logout functionality
  const handleLogout = useCallback(async () => {
    console.log("[useAuth] Logging out user...");

    // Clear local dialog states
    setIsUsernameDialogOpen(false);
    setVerifyDialogOpen(false);
    setIsLogoutConfirmDialogOpen(false);
    setNewUsername("");
    setNewPassword("");
    setVerifyTokenInput("");
    setVerifyPasswordInput("");
    setVerifyUsernameInput("");
    setUsernameError(null);
    setVerifyError(null);
    // hasPassword is now managed by the store and reset automatically on logout

    // Call store logout to clear all user data and refresh rooms
    await logout();

    toast.success("Logged Out", {
      description: "You have been successfully logged out.",
    });
  }, [logout]);

  // Show logout confirmation dialog
  const promptLogout = useCallback(async () => {
    setIsLogoutConfirmDialogOpen(true);
  }, []);

  // Handle logout confirmation
  const confirmLogout = useCallback(() => {
    setIsLogoutConfirmDialogOpen(false);
    handleLogout();
  }, [handleLogout]);

  return {
    // State
    username,
    authToken,
    hasPassword,

    // Username management
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    setUsernameError,

    // Token verification
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyTokenInput,
    setVerifyTokenInput,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,

    // Password management
    checkHasPassword,
    setPassword,

    // Logout
    logout: promptLogout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
  };
}
