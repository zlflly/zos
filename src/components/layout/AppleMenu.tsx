import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AboutFinderDialog } from "@/components/dialogs/AboutFinderDialog";
import { AnyApp } from "@/apps/base/types";
import { AppId } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";

interface AppleMenuProps {
  apps: AnyApp[];
}

export function AppleMenu({ apps }: AppleMenuProps) {
  const [aboutFinderOpen, setAboutFinderOpen] = useState(false);
  const launchApp = useLaunchApp();

  const handleAppClick = (appId: string) => {
    // Simply launch the app - the instance system will handle focus if already open
    launchApp(appId as AppId);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-3 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => setAboutFinderOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            About This Computer
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          {apps.map((app) => (
            <DropdownMenuItem
              key={app.id}
              onClick={() => handleAppClick(app.id)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
            >
              {typeof app.icon === "string" ? (
                <div className="w-4 h-4 flex items-center justify-center">
                  {app.icon}
                </div>
              ) : (
                <img
                  src={app.icon.src}
                  alt=""
                  className="w-4 h-4 [image-rendering:pixelated]"
                />
              )}
              {app.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AboutFinderDialog
        isOpen={aboutFinderOpen}
        onOpenChange={setAboutFinderOpen}
      />
    </>
  );
}
