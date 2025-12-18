import { useCallback, useEffect, useState } from 'react'

export function useResponsive() {
  const [isMobileView, setIsMobileView] = useState(false)
  
  // Function to detect mobile screen size
  const checkIsMobile = useCallback(() => {
    return window.innerWidth < 768 // md breakpoint
  }, [])
  
  useEffect(() => {
    // Set initial value
    setIsMobileView(checkIsMobile())
    
    // Add resize event listener
    const handleResize = () => {
      setIsMobileView(checkIsMobile())
    }
    
    window.addEventListener('resize', handleResize)
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [checkIsMobile])
  
  return { isMobile: isMobileView }
}
