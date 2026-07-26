import { Button } from './Button'

/**
 * Leaves the current room and returns to Home. The server garbage-collects a
 * room once its last player disconnects, so leaving also stops an idle room.
 */
export function LeaveButton({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="flex justify-end">
      <Button variant="ghost" onClick={onLeave}>
        Leave room
      </Button>
    </div>
  )
}
