import { memo } from 'react'
import QuoteHeader from '@/components/QuoteHeader'
import MainContent from '@/components/MainContent'
import StepNavigation from '@/components/steps/StepNavigation'
import StepRenderer from '@/components/steps/StepRenderer'

// Memoized App component to prevent unnecessary re-renders
const App = memo(function App() {
  return (
    <div
      className="min-h-screen pb-6 w-full bg-[#013252] text-white flex flex-col overflow-x-hidden"
      style={{ fontFamily: "'Open Sans', sans-serif" }}
    >
        <QuoteHeader />
      <StepNavigation />
        <MainContent>
        <StepRenderer />
        </MainContent>
      </div>
  )
})

export default App