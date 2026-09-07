"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export function AlertDialogContent({ children }: { children: React.ReactNode }) {
  return <AlertDialogPrimitive.Portal><AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/50" /><AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">{children}</AlertDialogPrimitive.Content></AlertDialogPrimitive.Portal>;
}
export function AlertDialogHeader({ children }: { children: React.ReactNode }) { return <div className="space-y-2">{children}</div>; }
export function AlertDialogTitle({ children }: { children: React.ReactNode }) { return <AlertDialogPrimitive.Title className="text-lg font-semibold">{children}</AlertDialogPrimitive.Title>; }
export function AlertDialogDescription({ children }: { children: React.ReactNode }) { return <AlertDialogPrimitive.Description className="text-sm text-slate-600">{children}</AlertDialogPrimitive.Description>; }
export function AlertDialogFooter({ children }: { children: React.ReactNode }) { return <div className="mt-6 flex justify-end gap-3">{children}</div>; }
