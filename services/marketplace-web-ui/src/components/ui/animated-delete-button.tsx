

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Trash2 } from "lucide-react"
import * as React from "react"

interface AnimatedDeleteButtonProps {
  onDelete: () => void
  isDeleting?: boolean
  className?: string
}

export function AnimatedDeleteButton({ 
  onDelete, 
  isDeleting = false,
  className 
}: AnimatedDeleteButtonProps) {
  const [isConfirming, setIsConfirming] = React.useState(false)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  // Auto-reset the button after 3 seconds if not clicked
  React.useEffect(() => {
    if (isConfirming) {
      timeoutRef.current = setTimeout(() => {
        setIsConfirming(false)
      }, 3000)
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [isConfirming])

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isConfirming) {
      // Second click: Confirm
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      onDelete()
    } else {
      // First click: Arm the button
      setIsConfirming(true)
    }
  }

  return (
    <Button
      variant={isConfirming ? "destructive" : "ghost"}
      size="default"
      onClick={handleClick}
      disabled={isDeleting}
      className={cn(
        "relative overflow-hidden transition-all duration-300", 
        "border-none",
        "focus-visible:ring-0 focus-visible:ring-offset-0 ring-0 outline-none",
        !isConfirming && "text-muted-foreground hover:text-destructive hover:bg-transparent",
        className
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {isConfirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex items-center min-w-[130px] justify-center"
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            <span className="font-medium">Are you sure?</span>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex items-center min-w-[70px] justify-start"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </motion.div>
        )}
      </AnimatePresence>
    </Button>
  )
}