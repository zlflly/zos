import { Button } from "@/components/ui/button";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { generateAppShareUrl } from "@/utils/sharedUrl";

// Define the label type
export type NoteLabelType = "note" | "key" | "off";

interface SynthMenuBarProps {
  onAddPreset: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onReset: () => void;
  onClose: () => void;
  presets: Array<{ id: string; name: string }>;
  currentPresetId: string;
  onLoadPresetById: (id: string) => void;
  labelType: NoteLabelType;
  onLabelTypeChange: (type: NoteLabelType) => void;
}

export function SynthMenuBar({
  onAddPreset,
  onShowHelp,
  onShowAbout,
  onReset,
  onClose,
  presets,
  currentPresetId,
  onLoadPresetById,
  labelType,
  onLabelTypeChange,
}: SynthMenuBarProps) {
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
            onClick={onAddPreset}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            New Preset
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onReset}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Reset Synth
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Presets Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            Presets
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          {presets.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={() => onLoadPresetById(preset.id)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              <span className={cn(currentPresetId !== preset.id && "pl-4")}>
                {currentPresetId === preset.id ? "✓ " : ""}
                {preset.name}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            View
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => onLabelTypeChange("note")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(labelType !== "note" && "pl-4")}>
              {labelType === "note" ? "✓ " : ""}
              Note Labels
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onLabelTypeChange("key")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(labelType !== "key" && "pl-4")}>
              {labelType === "key" ? "✓ " : ""}
              Key Labels
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onLabelTypeChange("off")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(labelType !== "off" && "pl-4")}>
              {labelType === "off" ? "✓ " : ""}
              No Labels
            </span>
          </DropdownMenuItem>
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
            Synth Help
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const appId = "synth"; // Specific app ID
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
            About Synth
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuBar>
  );
}
