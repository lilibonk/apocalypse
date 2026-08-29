package io.apocalypse.system.dict.controller;

import io.apocalypse.common.response.PageResult;
import io.apocalypse.framework.log.OperLog;
import io.apocalypse.system.dict.dto.request.DictDataSaveReq;
import io.apocalypse.system.dict.dto.request.DictTypeSaveReq;
import io.apocalypse.system.dict.dto.response.DictDataResp;
import io.apocalypse.system.dict.dto.response.DictTypeResp;
import io.apocalypse.system.dict.service.DictService;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** 字典管理端点。按 V3 菜单种子 perms 鉴权（{@code system:dict:*}），写操作落操作日志。 */
@RestController
@RequestMapping("/system/dict")
@RequiredArgsConstructor
public class DictController {

  private final DictService dictService;

  /** 字典类型分页。 */
  @GetMapping("/types/page")
  @PreAuthorize("hasAuthority('system:dict:list')")
  public PageResult<DictTypeResp> pageTypes(
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "10") int size,
      @RequestParam(required = false) String keyword) {
    return dictService.pageTypes(page, size, keyword);
  }

  /** 新增字典类型，返回主键。 */
  @PostMapping("/types")
  @PreAuthorize("hasAuthority('system:dict:add')")
  @OperLog(title = "字典管理", businessType = "INSERT")
  public Long createType(@Validated @RequestBody DictTypeSaveReq req) {
    return dictService.createType(req);
  }

  /** 更新字典类型。 */
  @PutMapping("/types/{id}")
  @PreAuthorize("hasAuthority('system:dict:edit')")
  @OperLog(title = "字典管理", businessType = "UPDATE")
  public void updateType(@PathVariable Long id, @Validated @RequestBody DictTypeSaveReq req) {
    dictService.updateType(id, req);
  }

  /** 删除字典类型（逻辑删，级联删数据）。 */
  @DeleteMapping("/types/{id}")
  @PreAuthorize("hasAuthority('system:dict:remove')")
  @OperLog(title = "字典管理", businessType = "DELETE")
  public void deleteType(@PathVariable Long id) {
    dictService.deleteType(id);
  }

  /** 字典数据分页。 */
  @GetMapping("/data/page")
  @PreAuthorize("hasAuthority('system:dict:list')")
  public PageResult<DictDataResp> pageData(
      @RequestParam(defaultValue = "1") int page,
      @RequestParam(defaultValue = "10") int size,
      @RequestParam(required = false) String dictType) {
    return dictService.pageData(page, size, dictType);
  }

  /** 按类型取有效字典项（下拉用，走 dict 两级缓存）。 */
  @GetMapping("/data/type/{type}")
  @PreAuthorize("hasAuthority('system:dict:list')")
  public List<DictDataResp> getByType(@PathVariable String type) {
    return dictService.getByType(type);
  }

  /** 新增字典数据，返回主键。 */
  @PostMapping("/data")
  @PreAuthorize("hasAuthority('system:dict:add')")
  @OperLog(title = "字典管理", businessType = "INSERT")
  public Long createData(@Validated @RequestBody DictDataSaveReq req) {
    return dictService.createData(req);
  }

  /** 更新字典数据。 */
  @PutMapping("/data/{id}")
  @PreAuthorize("hasAuthority('system:dict:edit')")
  @OperLog(title = "字典管理", businessType = "UPDATE")
  public void updateData(@PathVariable Long id, @Validated @RequestBody DictDataSaveReq req) {
    dictService.updateData(id, req);
  }

  /** 删除字典数据（逻辑删）。 */
  @DeleteMapping("/data/{id}")
  @PreAuthorize("hasAuthority('system:dict:remove')")
  @OperLog(title = "字典管理", businessType = "DELETE")
  public void deleteData(@PathVariable Long id) {
    dictService.deleteData(id);
  }
}
