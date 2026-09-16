/** Shared by the creation screens so their Stepper labels cannot drift apart. */
export const ONBOARDING_STEPS = ['기능명세서 등록', '저장소 연결', '기능대조']

/** Saved resources take precedence over an older wizard step. */
export function resumeOnboardingStep(project: {
  status: string
  onboardingStep: string
  repositories: unknown[]
  specDocument: unknown | null
}): 'SPEC' | 'REPOSITORIES' | null {
  if (project.status !== 'DRAFT' || project.repositories.length > 0) return null
  if (
    project.specDocument !== null ||
    project.onboardingStep === 'REPOSITORIES'
  )
    return 'REPOSITORIES'
  return project.onboardingStep === 'SPEC' ? 'SPEC' : null
}
