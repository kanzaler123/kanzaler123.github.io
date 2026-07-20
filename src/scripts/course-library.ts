const library = document.querySelector<HTMLElement>('[data-course-library]');

if (library) {
  const disclosure = library.querySelector<HTMLDetailsElement>('[data-library-disclosure]');
  const tabs = [...library.querySelectorAll<HTMLButtonElement>('[data-course-tab]')];
  const panels = [...library.querySelectorAll<HTMLElement>('[data-course-panel]')];
  const search = library.querySelector<HTMLInputElement>('[data-resource-search]');
  const clear = library.querySelector<HTMLButtonElement>('[data-resource-clear]');
  const status = library.querySelector<HTMLOutputElement>('[data-resource-status]');
  const empty = library.querySelector<HTMLElement>('[data-resource-empty]');
  let activeCourse = tabs[0]?.dataset.courseTab || '';

  const openLibrary = () => {
    if (disclosure) disclosure.open = true;
  };

  if (window.location.hash === '#course-resources') openLibrary();
  document.querySelectorAll<HTMLAnchorElement>('a[href="#course-resources"]').forEach((link) => {
    link.addEventListener('click', openLibrary);
  });
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#course-resources') openLibrary();
  });
  disclosure?.addEventListener('toggle', () => {
    if (disclosure.open) return;
    const top = library.getBoundingClientRect().top;
    if (top < 72) library.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  const setStatus = (count: number, searching = false) => {
    if (!status) return;
    status.innerHTML = `
      <span class="lang-copy lang-copy--en">${searching ? 'Found' : 'Showing'} ${count} ${count === 1 ? 'file' : 'files'}</span>
      <span class="lang-copy lang-copy--zh">${searching ? '找到' : '正在显示'} ${count} 份资料</span>
    `;
  };

  const selectCourse = (id: string) => {
    activeCourse = id;
    tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.courseTab === id)));
    panels.forEach((panel) => {
      const selected = panel.dataset.coursePanel === id;
      panel.hidden = !selected;
      panel.querySelectorAll<HTMLElement>('[data-resource-file]').forEach((file) => { file.hidden = false; });
      panel.querySelectorAll<HTMLDetailsElement>('[data-resource-category]').forEach((category) => { category.hidden = false; });
      if (selected) setStatus(panel.querySelectorAll('[data-resource-file]').length);
    });
    if (empty) empty.hidden = true;
  };

  const applySearch = () => {
    const query = search?.value.trim().toLocaleLowerCase('zh-CN') || '';
    if (clear) clear.hidden = query.length === 0;
    if (!query) {
      selectCourse(activeCourse);
      return;
    }

    let totalMatches = 0;
    panels.forEach((panel) => {
      let panelMatches = 0;
      const courseMatches = (panel.dataset.courseName || '').toLocaleLowerCase('zh-CN').includes(query);
      panel.querySelectorAll<HTMLDetailsElement>('[data-resource-category]').forEach((category) => {
        let categoryMatches = 0;
        category.querySelectorAll<HTMLElement>('[data-resource-file]').forEach((file) => {
          const matches = courseMatches || (file.dataset.search || '').includes(query);
          file.hidden = !matches;
          if (matches) categoryMatches += 1;
        });
        category.hidden = categoryMatches === 0;
        if (categoryMatches) category.open = true;
        panelMatches += categoryMatches;
      });
      panel.hidden = panelMatches === 0;
      totalMatches += panelMatches;
    });

    if (empty) empty.hidden = totalMatches > 0;
    setStatus(totalMatches, true);
  };

  const syncLocale = () => {
    if (!search) return;
    const chinese = document.documentElement.dataset.locale === 'zh-CN';
    search.placeholder = chinese ? search.dataset.placeholderZh || '' : search.dataset.placeholderEn || '';
  };

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    if (search) search.value = '';
    if (clear) clear.hidden = true;
    selectCourse(tab.dataset.courseTab || '');
  }));
  search?.addEventListener('input', applySearch);
  clear?.addEventListener('click', () => {
    if (!search) return;
    search.value = '';
    search.focus();
    applySearch();
  });

  new MutationObserver(syncLocale).observe(document.documentElement, { attributes: true, attributeFilter: ['data-locale'] });
  syncLocale();
}
