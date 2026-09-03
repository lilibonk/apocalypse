package io.apocalypse.calendar.infrastructure.persistence;

import io.apocalypse.calendar.domain.BaselineCorrectionSnapshot;
import io.apocalypse.calendar.domain.BaselineImportPublication;
import io.apocalypse.calendar.domain.BaselineReleaseRepository;
import io.apocalypse.calendar.domain.BaselineReleaseSnapshot;
import io.apocalypse.calendar.domain.DayField;
import io.apocalypse.calendar.domain.OverrideAction;
import io.apocalypse.common.exception.ConcurrencyGuard;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Repository;

import lombok.RequiredArgsConstructor;

@Repository
@RequiredArgsConstructor
public class MybatisBaselineReleaseRepository implements BaselineReleaseRepository {

  private final BaselineReleaseMapper mapper;

  private final BaselineCorrectionMapper correctionMapper;

  private final DayFieldValueJsonCodec valueJsonCodec;

  @Override
  public void lockPublicationScope(String regionCode) {
    mapper.lockPublicationScope(regionCode);
  }

  @Override
  public Optional<BaselineReleaseSnapshot> findPublished(String regionCode) {
    return Optional.ofNullable(mapper.selectPublished(regionCode)).map(this::toSnapshot);
  }

  @Override
  public List<BaselineCorrectionSnapshot> findCorrections(Long releaseId) {
    return correctionMapper.selectByReleaseId(releaseId).stream().map(this::toCorrection).toList();
  }

  @Override
  public BaselineReleaseSnapshot publishImport(BaselineImportPublication publication) {
    BaselineReleaseDo current = mapper.selectPublishedByIdForUpdate(publication.currentReleaseId());
    if (current == null) {
      throw new io.apocalypse.common.exception.BizException(
          io.apocalypse.common.response.ErrorCode.CONFLICT);
    }
    List<BaselineCorrectionSnapshot> retained =
        findCorrections(current.getId()).stream()
            .filter(value -> value.date().getYear() != publication.replacedYear())
            .toList();
    ConcurrencyGuard.requireSingleRow(mapper.supersede(current.getId(), publication.actor()));

    BaselineReleaseDo created = copyRelease(current, publication);
    mapper.insert(created);
    retained.forEach(
        correction ->
            insertCorrection(
                created.getId(),
                correction,
                correction.sourceImportId(),
                correction.sourceUri(),
                correction.reason(),
                publication.actor()));
    publication
        .importedCorrections()
        .forEach(
            correction ->
                insertCorrection(
                    created.getId(),
                    correction,
                    publication.sourceImportId(),
                    publication.sourceManifestUri(),
                    publication.reason(),
                    publication.actor()));
    return toSnapshot(created);
  }

  private BaselineReleaseSnapshot toSnapshot(BaselineReleaseDo value) {
    return new BaselineReleaseSnapshot(
        value.getId(),
        value.getRegionCode(),
        value.getReleaseKey(),
        value.getProviderKey(),
        value.getProviderVersion(),
        value.getProviderArtifactSha256(),
        value.getHolidayBundleVersion(),
        value.getHolidayBundleSha256(),
        value.getSupportedFrom(),
        value.getSupportedTo(),
        value.getContentHash());
  }

  private BaselineCorrectionSnapshot toCorrection(BaselineCorrectionDo value) {
    return new BaselineCorrectionSnapshot(
        value.getLocalDate(),
        DayField.valueOf(value.getFieldKey()),
        OverrideAction.valueOf(value.getAction()),
        value.getValueJson() == null ? null : valueJsonCodec.read(value.getValueJson().toString()),
        value.getSourceUri(),
        value.getReason(),
        value.getSourceImportId());
  }

  private static BaselineReleaseDo copyRelease(
      BaselineReleaseDo current, BaselineImportPublication publication) {
    BaselineReleaseDo created = new BaselineReleaseDo();
    created.setRegionCode(current.getRegionCode());
    created.setReleaseKey(publication.releaseKey());
    created.setProviderKey(current.getProviderKey());
    created.setProviderVersion(current.getProviderVersion());
    created.setProviderArtifactSha256(current.getProviderArtifactSha256());
    created.setHolidayBundleVersion(current.getHolidayBundleVersion());
    created.setHolidayBundleSha256(current.getHolidayBundleSha256());
    created.setSupportedFrom(current.getSupportedFrom());
    created.setSupportedTo(current.getSupportedTo());
    created.setSourceManifestUri(publication.sourceManifestUri());
    created.setSourceImportId(publication.sourceImportId());
    created.setContentHash(publication.contentHash());
    created.setState("PUBLISHED");
    created.setPublishedAt(LocalDateTime.now());
    created.setPublishedBy(publication.actor());
    created.setCreateBy(publication.actor());
    created.setUpdateBy(publication.actor());
    return created;
  }

  private void insertCorrection(
      Long releaseId,
      BaselineCorrectionSnapshot correction,
      Long sourceImportId,
      String sourceUri,
      String reason,
      String actor) {
    BaselineCorrectionDo value = new BaselineCorrectionDo();
    value.setId(com.baomidou.mybatisplus.core.toolkit.IdWorker.getId());
    value.setReleaseId(releaseId);
    value.setLocalDate(correction.date());
    value.setFieldKey(correction.field().name());
    value.setAction(correction.action().name());
    value.setSourceUri(sourceUri);
    value.setSourceImportId(sourceImportId);
    value.setReason(reason);
    ConcurrencyGuard.requireSingleRow(
        correctionMapper.insertJson(value, valueJsonCodec.write(correction.value()), actor));
  }
}
