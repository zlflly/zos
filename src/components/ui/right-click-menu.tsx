import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { ReactNode } from "react";

// ------------------ Types ------------------
export type MenuItem =
  | {
      type: "item";
      label: string;
      onSelect?: () => void;
      disabled?: boolean;
    }
  | {
      type: "separator";
    }
  | {
      type: "submenu";
      label: string;
      items: MenuItem[];
    }
  | {
      type: "radioGroup";
      value: string;
      onChange: (val: string) => void;
      items: Array<{ label: string; value: string }>;
    };

interface RightClickMenuProps {
  position: { x: number; y: number } | null;
  onClose: () => void;
  items: MenuItem[];
  /** Optional alignment, defaults to "start" */
  align?: "start" | "center" | "end";
}

export const menuItemClass =
  "text-md h-6 px-3 active:bg-gray-900 active:text-white min-w-[140px]";

// ------------------ Renderer helpers ------------------
function renderItems(items: MenuItem[]): ReactNode {
  return items.map((item, idx) => {
    switch (item.type) {
      case "item":
        return (
          <DropdownMenuItem
            key={idx}
            onSelect={item.onSelect}
            disabled={item.disabled}
            className={menuItemClass}
          >
            {item.label}
          </DropdownMenuItem>
        );
      case "separator":
        return (
          <DropdownMenuSeparator key={idx} className="h-[2px] bg-black my-1" />
        );
      case "submenu":
        return (
          <DropdownMenuSub key={idx}>
            <DropdownMenuSubTrigger className={menuItemClass}>
              {item.label}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="px-0">
              {renderItems(item.items)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      case "radioGroup":
        return (
          <>
            {item.items.map((ri) => (
              <DropdownMenuCheckboxItem
                key={ri.value}
                checked={item.value === ri.value}
                onCheckedChange={() => item.onChange(ri.value)}
                className={`${menuItemClass} pl-8 flex items-center`}
              >
                {ri.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        );
      default:
        return null;
    }
  });
}

// ------------------ Component ------------------
export function RightClickMenu({
  position,
  onClose,
  items,
  align = "start",
}: RightClickMenuProps) {
  if (!position) return null;

  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <div
          style={{
            position: "absolute",
            top: position.y,
            left: position.x,
            width: 0,
            height: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={4}
        alignOffset={4}
        className="px-0"
      >
        {renderItems(items)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
