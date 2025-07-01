import React from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dot,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TimeNavigationControlsProps {
  onOlder: () => void;
  onNewer: () => void;
  onNow: () => void;
  isOlderDisabled: boolean;
  isNewerDisabled: boolean;
  isNowDisabled: boolean;
  olderLabel: string;
  newerLabel: string;
  nowLabel?: string; // Optional, defaults to "Now"
  layout: "horizontal" | "vertical";
  playClickSound: () => void;
}

const TimeNavigationControls: React.FC<TimeNavigationControlsProps> = ({
  onOlder,
  onNewer,
  onNow,
  isOlderDisabled,
  isNewerDisabled,
  isNowDisabled,
  olderLabel,
  newerLabel,
  nowLabel = "Now",
  layout,
  playClickSound,
}) => {
  const OlderIcon = layout === "vertical" ? ChevronDown : ChevronRight;
  const NewerIcon = layout === "vertical" ? ChevronUp : ChevronLeft;

  const handleOlderClick = () => {
    playClickSound();
    onOlder();
  };

  const handleNewerClick = () => {
    playClickSound();
    onNewer();
  };

  const handleNowClick = () => {
    playClickSound();
    onNow();
  };

  const buttonClasses =
    "text-white/60 hover:text-white hover:bg-white/10 rounded p-1.5 h-8 w-8 flex items-center justify-center disabled:opacity-30 transition-colors";
  const mobileButtonClasses =
    "text-white/60 hover:text-white hover:bg-neutral-600/70 rounded p-1.5 h-8 w-8 flex items-center justify-center disabled:opacity-30 transition-colors";

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className={cn(
          "flex items-center justify-center gap-4",
          layout === "vertical" ? "flex-col" : "flex-row"
        )}
      >
        {/* Top/Left Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={
                layout === "vertical" ? handleOlderClick : handleNewerClick
              }
              className={
                layout === "vertical" ? buttonClasses : mobileButtonClasses
              }
              disabled={
                layout === "vertical" ? isOlderDisabled : isNewerDisabled
              }
              aria-label={
                layout === "vertical" ? "Older Version" : "Newer Version"
              }
            >
              <NewerIcon size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={layout === "vertical" ? "right" : "bottom"}>
            <p>{layout === "vertical" ? olderLabel : newerLabel}</p>
          </TooltipContent>
        </Tooltip>

        {/* Go to Now Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleNowClick}
              className={
                layout === "vertical" ? buttonClasses : mobileButtonClasses
              }
              disabled={isNowDisabled}
              aria-label="Go to Now"
            >
              <Dot size={24} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={layout === "vertical" ? "right" : "bottom"}>
            <p>{nowLabel}</p>
          </TooltipContent>
        </Tooltip>

        {/* Bottom/Right Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={
                layout === "vertical" ? handleNewerClick : handleOlderClick
              }
              className={
                layout === "vertical" ? buttonClasses : mobileButtonClasses
              }
              disabled={
                layout === "vertical" ? isNewerDisabled : isOlderDisabled
              }
              aria-label={
                layout === "vertical" ? "Newer Version" : "Older Version"
              }
            >
              <OlderIcon size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={layout === "vertical" ? "right" : "bottom"}>
            <p>{layout === "vertical" ? newerLabel : olderLabel}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default TimeNavigationControls;
