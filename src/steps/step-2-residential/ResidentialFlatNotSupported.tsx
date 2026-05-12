import logo from '@/assets/logo.png'

export default function ResidentialFlatNotSupported() {
  return (
    <div className="w-full text-center">
      <div className="flex w-full justify-center">
        <img src={logo} alt="Kings Window Cleaning" className="h-24 w-auto md:h-28" />
      </div>
      <div className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-[#BF8639]">Sorry, we do not clean individual flats or maisonettes.</h2>
        <p className="text-white/90">If you believe your property should still be considered, please contact us.</p>
      </div>
      {/* Navigation buttons removed per requirements */}
    </div>
  )
}


