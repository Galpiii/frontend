const collectionNotices: Record<string, string> = {
  PATCH_OMITTED: '일부 변경 내용은 분석에 포함되지 않았습니다.',
  FILE_LIMIT_EXCEEDED:
    '파일 수가 수집 한도를 초과해 일부 파일이 제외되었습니다.',
  BINARY: '이미지 등 일부 파일의 내용은 분석에 포함되지 않았습니다.',
  PR_LIMIT_EXCEEDED: '수집 가능한 PR 수를 초과했습니다.',
  TOTAL_CONTENT_LIMIT:
    '저장소 내용이 수집 용량 한도를 초과해 일부 파일이 제외되었습니다.',
  ARCHIVE_SIZE_LIMIT:
    '저장소 압축 파일이 처리 용량 한도를 초과해 일부 파일을 가져오지 못했습니다.',
  RATE_LIMITED:
    'GitHub 요청 제한으로 수집이 중단되었습니다. 다시 시도해주세요.',
  PR_COLLECTION_PARTIAL: '일부 PR을 가져오지 못했습니다.',
  COMMIT_LIMIT_EXCEEDED:
    '커밋 수가 수집 한도를 초과해 일부 커밋이 제외되었습니다.',
  PR_CONTENT_LIMIT:
    'PR 내용이 분석 용량 한도를 초과해 일부 내용이 제외되었습니다.',
  PR_REQUEST_LIMIT:
    '수집 요청 횟수가 한도에 도달해 일부 PR을 가져오지 못했습니다.',
  FILE_READ_FAILED: '일부 파일을 읽지 못해 분석에 포함되지 않았습니다.',
}

export function getCollectionNotices(
  reasons: readonly string[] = [],
): string[] {
  // Only known user-facing notices are shown; SECRET_REDACTED stays internal.
  return [
    ...new Set(
      reasons.flatMap((reason) =>
        Object.hasOwn(collectionNotices, reason)
          ? [collectionNotices[reason]]
          : [],
      ),
    ),
  ]
}
