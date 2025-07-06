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
  Music,
  MousePointerClick,
} from "lucide-react";
import { useSound, Sounds } from "@/hooks/useSound";

interface VolumeMixerProps {
  masterVolume: number;
  setMasterVolume: (value: number) => void;
  handleMasterMuteToggle: () => void;
  uiVolume: number;
  setUiVolume: (value: number) => void;
  handleUiMuteToggle: () => void;
  ipodVolume: number;
  setIpodVolume: (value: number) => void;
  handleIpodMuteToggle: () => void;
  isIOS: boolean;
}

export function VolumeMixer({
  masterVolume,
  setMasterVolume,
  handleMasterMuteToggle,
  uiVolume,
  setUiVolume,
  handleUiMuteToggle,
  ipodVolume,
  setIpodVolume,
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

        {/* iPod Volume */}
        <div className="flex flex-col items-center gap-0">
          <Slider
            orientation="vertical"
            min={0}
            max={1}
            step={0.05}
            value={[ipodVolume]}
            onValueChange={(v) => {
              setIpodVolume(v[0]);
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
                onClick={handleIpodMuteToggle}
                className={`h-8 w-8 ${ipodVolume === 0 ? "opacity-40" : ""}`}
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
