import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Volume2,
  // VolumeX, // Removed
  // Speaker, // Removed
  // Mic, // Removed
  Music,
  // Headphones, // Removed
  MousePointerClick,
  MessageCircle,
  Speech as SpeechIcon,
} from "lucide-react";
import { useSound, Sounds } from "@/hooks/useSound";

interface VolumeMixerProps {
  masterVolume: number;
  setMasterVolume: (value: number) => void;
  setPrevMasterVolume: (value: number) => void;
  handleMasterMuteToggle: () => void;
  uiVolume: number;
  setUiVolume: (value: number) => void;
  setPrevUiVolume: (value: number) => void;
  handleUiMuteToggle: () => void;
  speechVolume: number;
  setSpeechVolume: (value: number) => void;
  setPrevSpeechVolume: (value: number) => void;
  handleSpeechMuteToggle: () => void;
  chatSynthVolume: number;
  setChatSynthVolume: (value: number) => void;
  setPrevChatSynthVolume: (value: number) => void;
  handleChatSynthMuteToggle: () => void;
  ipodVolume: number;
  setIpodVolume: (value: number) => void;
  setPrevIpodVolume: (value: number) => void;
  handleIpodMuteToggle: () => void;
  isIOS: boolean;
}

export function VolumeMixer({
  masterVolume,
  setMasterVolume,
  setPrevMasterVolume,
  handleMasterMuteToggle,
  uiVolume,
  setUiVolume,
  setPrevUiVolume,
  handleUiMuteToggle,
  speechVolume,
  setSpeechVolume,
  setPrevSpeechVolume,
  handleSpeechMuteToggle,
  chatSynthVolume,
  setChatSynthVolume,
  setPrevChatSynthVolume,
  handleChatSynthMuteToggle,
  ipodVolume,
  setIpodVolume,
  setPrevIpodVolume,
  handleIpodMuteToggle,
  isIOS,
}: VolumeMixerProps) {
  const { play: playVolumeChangeSound } = useSound(Sounds.VOLUME_CHANGE);
  return (
    <TooltipProvider>
      <div className="flex justify-around items-end py-2">
        {/* Master Volume */}
        <div className="flex flex-col items-center gap-0">
          <Slider
            orientation="vertical"
            min={0}
            max={1}
            step={0.05}
            value={[masterVolume]}
            onValueChange={(v) => {
              setMasterVolume(v[0]);
              if (v[0] > 0) setPrevMasterVolume(v[0]);
            }}
            onValueCommit={() => {
              playVolumeChangeSound();
            }}
            className="h-18 w-5"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMasterMuteToggle}
                className={`h-8 w-8 ${masterVolume === 0 ? "opacity-40" : ""}`}
              >
                <Volume2 size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Master Volume</p>
            </TooltipContent>
          </Tooltip>
          <p className="text-[10px] font-geneva-12 text-gray-600">Master</p>
        </div>

        {/* UI Volume */}
        <div className="flex flex-col items-center gap-0">
          <Slider
            orientation="vertical"
            min={0}
            max={1}
            step={0.05}
            value={[uiVolume]}
            onValueChange={(v) => {
              setUiVolume(v[0]);
              if (v[0] > 0) setPrevUiVolume(v[0]);
            }}
            onValueCommit={() => {
              playVolumeChangeSound();
            }}
            className="h-18 w-5"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleUiMuteToggle}
                className={`h-8 w-8 ${uiVolume === 0 ? "opacity-40" : ""}`}
              >
                <MousePointerClick size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>UI Volume</p>
            </TooltipContent>
          </Tooltip>
          <p className="text-[10px] font-geneva-12 text-gray-600">UI</p>
        </div>

        {/* Speech Volume */}
        <div className="flex flex-col items-center gap-0">
          <Slider
            orientation="vertical"
            min={0}
            max={2}
            step={0.1}
            value={[speechVolume]}
            onValueChange={(v) => {
              setSpeechVolume(v[0]);
              if (v[0] > 0) setPrevSpeechVolume(v[0]);
            }}
            onValueCommit={() => {
              playVolumeChangeSound();
            }}
            className="h-18 w-5"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSpeechMuteToggle}
                className={`h-8 w-8 ${speechVolume === 0 ? "opacity-40" : ""}`}
              >
                <SpeechIcon size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Speech Volume</p>
            </TooltipContent>
          </Tooltip>
          <p className="text-[10px] font-geneva-12 text-gray-600">Speech</p>
        </div>

        {/* Chat Synth Volume */}
        <div className="flex flex-col items-center gap-0">
          <Slider
            orientation="vertical"
            min={0}
            max={2}
            step={0.1}
            value={[chatSynthVolume]}
            onValueChange={(v) => {
              setChatSynthVolume(v[0]);
              if (v[0] > 0) setPrevChatSynthVolume(v[0]);
            }}
            onValueCommit={() => {
              playVolumeChangeSound();
            }}
            className="h-18 w-5"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleChatSynthMuteToggle}
                className={`h-8 w-8 ${
                  chatSynthVolume === 0 ? "opacity-40" : ""
                }`}
              >
                <MessageCircle size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Chat Synth Volume</p>
            </TooltipContent>
          </Tooltip>
          <p className="text-[10px] font-geneva-12 text-gray-600">Synth</p>
        </div>

        {/* iPod Volume */}
        <div className="flex flex-col items-center gap-0">
          <Slider
            orientation="vertical"
            min={0}
            max={1}
            step={0.05}
            value={[isIOS ? 1 : ipodVolume]}
            onValueChange={
              isIOS
                ? undefined
                : (v) => {
                    setIpodVolume(v[0]);
                    if (v[0] > 0) setPrevIpodVolume(v[0]);
                  }
            }
            onValueCommit={
              isIOS
                ? undefined
                : () => {
                    playVolumeChangeSound();
                  }
            }
            disabled={isIOS}
            className={`h-18 w-5 ${isIOS ? "opacity-40" : ""}`}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleIpodMuteToggle}
                disabled={isIOS}
                className={`h-8 w-8 ${isIOS ? "opacity-40" : ""} ${
                  !isIOS && ipodVolume === 0 ? "opacity-40" : ""
                }`}
              >
                <Music size={20} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>iPod Volume</p>
            </TooltipContent>
          </Tooltip>
          <p className="text-[10px] font-geneva-12 text-gray-600">iPod</p>
        </div>
      </div>
      {isIOS && (
        <div className="flex justify-center">
          <p className="text-[10px] text-center text-gray-600 font-geneva-12">
            On iOS, use hardware buttons to control media volume.
          </p>
        </div>
      )}
    </TooltipProvider>
  );
}
