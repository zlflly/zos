import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { AppProps } from "../../base/types";
import { MenuBar } from "@/components/layout/MenuBar";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { generateAppShareUrl } from "@/utils/sharedUrl";

interface SoundboardMenuBarProps extends Omit<AppProps, "onClose"> {
  onClose: () => void;
  onNewBoard?: () => void;
  onImportBoard?: () => void;
  onExportBoard?: () => void;
  onReloadBoard?: () => void;
  onReloadAllSounds?: () => void;
  onRenameBoard?: () => void;
  onDeleteBoard?: () => void;
  canDeleteBoard?: boolean;
  onShowHelp?: () => void;
  onShowAbout?: () => void;
  showWaveforms?: boolean;
  onToggleWaveforms?: (show: boolean) => void;
  showEmojis?: boolean;
  onToggleEmojis?: (show: boolean) => void;
}

export function SoundboardMenuBar({
  onNewBoard,
  onImportBoard,
  onExportBoard,
  onReloadBoard,
  onReloadAllSounds,
  onRenameBoard,
  onDeleteBoard,
  canDeleteBoard,
  onShowHelp,
  onShowAbout,
  showWaveforms,
  onToggleWaveforms,
  showEmojis,
  onToggleEmojis,
  onClose,
}: SoundboardMenuBarProps) {
  const [isOptionPressed, setIsOptionPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setIsOptionPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setIsOptionPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return (
    <MenuBar>
      {/* File Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            File
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onNewBoard}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            New Soundboard
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onImportBoard}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Import Soundboards...
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onExportBoard}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Export Soundboards...
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onReloadBoard}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Reset Soundboards
          </DropdownMenuItem>
          {isOptionPressed && (
            <DropdownMenuItem
              onClick={onReloadAllSounds}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Load Special Soundboards
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            Edit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onRenameBoard}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Rename Soundboard
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDeleteBoard}
            disabled={!canDeleteBoard}
            className={
              !canDeleteBoard
                ? "text-gray-400 text-md h-6 px-3"
                : "text-md h-6 px-3 active:bg-gray-900 active:text-white"
            }
          >
            Delete Soundboard
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            View
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuCheckboxItem
            checked={showWaveforms}
            onCheckedChange={onToggleWaveforms}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Waveforms</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showEmojis}
            onCheckedChange={onToggleEmojis}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>Emojis</span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Help Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Soundboard Help
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const appId = "soundboard";
              const shareUrl = generateAppShareUrl(appId);
              if (!shareUrl) return;
              try {
                await navigator.clipboard.writeText(shareUrl);
                toast.success("App link copied!", {
                  description: `Link to ${appId} copied to clipboard.`,
                });
              } catch (err) {
                console.error("Failed to copy app link: ", err);
                toast.error("Failed to copy link", {
                  description: "Could not copy link to clipboard.",
                });
              }
            }}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Share App...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            About Soundboard
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuBar>
  );
}
