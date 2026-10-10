'use client';

import { Dialog } from '@/components/nv/dialog';
import { Button } from '@/components/nv/primitives';

/** DEMO: the dialog primitive with a trigger, for the review page. */
export function DialogDemo() {
  return (
    <Dialog
      trigger={<Button variant="outline">Open a dialog</Button>}
      title="DEMO dialog"
      description="Focus is trapped here; Escape or Close returns focus to the button."
    >
      <div className="flex gap-3">
        <Button>Primary action</Button>
      </div>
    </Dialog>
  );
}
