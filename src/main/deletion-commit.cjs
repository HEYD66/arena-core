'use strict';
// Separate the metadata commit from subsequent journal writes. Once metadata
// has been removed, a journal-write failure must not erase the recovery intent.
function commitDeletionMetadata(store, journal, dir, id) {
  journal.begin(dir, id);
  const warnings = [];
  try {
    store.remove(id);
  } catch (error) {
    if (!error.atomicWriteCommitted) {
      journal.finish(dir, id);
      throw error;
    }
    warnings.push('实例配置已删除，但持久化确认未完成');
  }
  try { journal.update(dir, id, { steps: { metadata: 'done' } }); }
  catch { warnings.push('删除配置已提交，但步骤记录写入失败'); }
  return warnings;
}
module.exports = { commitDeletionMetadata };
