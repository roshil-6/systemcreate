import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './Leads.css';
import { FiSearch, FiFilter, FiEdit2, FiCalendar, FiMessageSquare, FiCheck, FiArrowLeft, FiDownload, FiUser, FiEdit, FiTrash2, FiClock, FiGrid, FiX, FiChevronDown } from 'react-icons/fi';

const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const Leads = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [bulkAssignStaffId, setBulkAssignStaffId] = useState('');
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [phoneSearchInput, setPhoneSearchInput] = useState(searchParams.get('phone') || '');
  const [phoneSearch, setPhoneSearch] = useState(searchParams.get('phone') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [assignedStaffFilter, setAssignedStaffFilter] = useState(searchParams.get('assigned_staff_id') || '');
  const [viewType, setViewType] = useState(searchParams.get('viewType') || 'all');
  const [dateFrom, setDateFrom] = useState(searchParams.get('created_from') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('created_to') || '');
  const [createdMonth, setCreatedMonth] = useState(searchParams.get('created_month') || '');
  const [selectedCreatedOn, setSelectedCreatedOn] = useState(searchParams.get('created_on') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'created_desc');
  const [createdTodayFilter, setCreatedTodayFilter] = useState(searchParams.get('created_today') === 'true');
  const [leadSourceTypeFilter, setLeadSourceTypeFilter] = useState(searchParams.get('lead_source_type') || '');
  const [nameStarts, setNameStarts] = useState(searchParams.get('name_starts') || '');
  const [excelModal, setExcelModal] = useState({ open: false, data: null, loading: false, leadName: '' });
  const [assigningLeadId, setAssigningLeadId] = useState(null);
  const [assignStaffId, setAssignStaffId] = useState('');
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    status: '',
    priority: '',
    comment: '',
    follow_up_date: '',
    follow_up_status: '',
  });
  const [bulkEditLoading, setBulkEditLoading] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [importHistory, setImportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Trash / Recycle Bin
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashLeads, setTrashLeads] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState([]);
  const [trashActionLoading, setTrashActionLoading] = useState(false);
  // Pagination
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const LEADS_PER_PAGE = 50;

  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const filtersAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (filtersAutoOpenedRef.current) return;
    filtersAutoOpenedRef.current = true;
    const p = searchParams;
    const unified =
      p.get('created_today') === 'true' ||
      ['new', 'follow_up'].includes(p.get('viewType') || '') ||
      ['manual', 'bulk_import'].includes(p.get('lead_source_type') || '');
    const has =
      !!(p.get('search') || '').trim() ||
      !!(p.get('phone') || '').trim() ||
      !!(p.get('status') || '') ||
      !!(p.get('assigned_staff_id') || '') ||
      unified ||
      !!(p.get('created_from') || p.get('created_to') || p.get('created_month') || p.get('created_on')) ||
      !!(p.get('name_starts') || '') ||
      (!!p.get('sort') && p.get('sort') !== 'created_desc');
    if (has) setFiltersPanelOpen(true);
  }, [searchParams]);

  useEffect(() => {
      const urlSearch = searchParams.get('search') || '';
    const urlPhone = searchParams.get('phone') || '';
    const urlStatus = searchParams.get('status') || '';
    const urlViewType = searchParams.get('viewType') || 'all';
    const urlDateFrom = searchParams.get('created_from') || '';
    const urlDateTo = searchParams.get('created_to') || '';
    const urlCreatedMonth = searchParams.get('created_month') || '';
    const urlCreatedOn = searchParams.get('created_on') || '';
    const urlSort = searchParams.get('sort') || 'created_desc';
    const urlCreatedToday = searchParams.get('created_today') === 'true';
    const urlLeadSourceType = searchParams.get('lead_source_type') || '';
    const urlNameStarts = searchParams.get('name_starts') || '';
    const showHistory = searchParams.get('showHistory') === 'true';

    setSearch(urlSearch);
    setSearchInput(urlSearch);
    setPhoneSearch(urlPhone);
    setPhoneSearchInput(urlPhone);
    setStatusFilter(urlStatus);
    setViewType(urlViewType);
    setDateFrom(urlDateFrom);
    setDateTo(urlDateTo);
    setCreatedMonth(urlCreatedMonth);
    setSelectedCreatedOn(urlCreatedOn);
    setSortBy(urlSort);
    setCreatedTodayFilter(urlCreatedToday);
    setLeadSourceTypeFilter(urlLeadSourceType);
    setNameStarts(urlNameStarts);

    if (showHistory) {
      setShowHistoryModal(true);
      fetchImportHistory();
    }
  }, [searchParams]);

  useEffect(() => {
    // Attempt to restore state from session storage if we came back to this page
    const cachedState = sessionStorage.getItem('leadsPageState');
    let restored = false;

    if (cachedState) {
      try {
        const state = JSON.parse(cachedState);
        // Add a timestamp check so we don't use state older than 60 minutes
        const isRecent = state.timestamp && (Date.now() - state.timestamp < 60 * 60 * 1000);
        const urlFollowUp = searchParams.get('follow_up_date') || '';
        const urlFollowUpOverdue = searchParams.get('follow_up_overdue') || '';
        const urlCreatedToday = searchParams.get('created_today') === 'true';
        const urlLeadSourceType = searchParams.get('lead_source_type') || '';

        // Don't restore from cache when URL has follow-up or other special filters - always fetch fresh
        const hasFollowUpFilter = !!urlFollowUp || !!urlFollowUpOverdue || urlCreatedToday || !!urlLeadSourceType;

        // Only restore if the filters match the URL filters to avoid stale data on new searches
        if (!hasFollowUpFilter && isRecent && state.search === search && state.statusFilter === statusFilter &&
          state.phoneSearch === phoneSearch && state.assignedStaffFilter === assignedStaffFilter &&
          state.viewType === viewType && state.dateFrom === dateFrom && state.dateTo === dateTo &&
          (state.createdMonth || '') === (createdMonth || '') &&
          (state.selectedCreatedOn || '') === (selectedCreatedOn || '') &&
          (state.nameStarts || '') === (nameStarts || '') &&
          (state.sortBy || 'created_desc') === (sortBy || 'created_desc')) {

          setLeads(state.leads);
          setOffset(state.offset);
          setTotalCount(state.totalCount);
          setLoading(false); // Stop the spinner since we successfully restored data
          restored = true;

          // We will let a separate useLayoutEffect handle the actual scrolling
          // once the leads are officially rendered in the DOM.
          restored = true;
        }
      } catch (e) {
        console.error("Error restoring leads state", e);
      }
    }

    if (!restored) {
      // Clear invalid cache
      sessionStorage.removeItem('leadsPageState');
      setOffset(0);
      fetchLeads(true);
    }
  }, [statusFilter, search, phoneSearch, assignedStaffFilter, viewType, createdMonth, selectedCreatedOn, nameStarts, searchParams]);

  // Bulletproof scroll restoration via element ID
  React.useLayoutEffect(() => {
    const cachedState = sessionStorage.getItem('leadsPageState');
    if (cachedState && leads.length > 0) {
      try {
        const state = JSON.parse(cachedState);
        const targetId = state.clickedLeadId;

        if (targetId || state.scrollPosition) {
          let attempts = 0;

          const restoreScroll = () => {
            attempts++;
            const rowElement = targetId ? document.getElementById(`lead-row-${targetId}`) : null;
            const container = document.querySelector('.leads-table-container');

            if (rowElement) {
              rowElement.scrollIntoView({ block: 'center', inline: 'nearest' });

              const updatedState = { ...state };
              delete updatedState.clickedLeadId;
              sessionStorage.setItem('leadsPageState', JSON.stringify(updatedState));
              return true;
            } else if (container && container.scrollHeight > container.clientHeight && state.scrollPosition > 0) {
              // Fallback to strict pixel scrolling if ID isn't found but scroll container is ready
              container.scrollTop = state.scrollPosition;
              if (container.scrollTop > 0) return true;
            }
            return false;
          };

          const checkInterval = setInterval(() => {
            if (restoreScroll() || attempts >= 25) { // 25 attempts * 100ms = 2.5 seconds
              clearInterval(checkInterval);
            }
          }, 100);

          restoreScroll(); // first attempt immediate
        }
      } catch (e) {
        // ignore JSON parse errors
      }
    }
  }, [leads]);

  // Save state before leaving the page
  useEffect(() => {
    const saveState = () => {
      if (leads.length > 0) {
        const container = document.querySelector('.leads-table-container');
        const scrollPos = container ? container.scrollTop : window.scrollY;

        const existingRaw = sessionStorage.getItem('leadsPageState');
        const existing = existingRaw ? JSON.parse(existingRaw) : {};

        sessionStorage.setItem('leadsPageState', JSON.stringify({
          ...existing,
          leads,
          offset,
          totalCount,
          search,
          statusFilter,
          phoneSearch,
          assignedStaffFilter,
          viewType,
          dateFrom,
          dateTo,
          createdMonth,
          selectedCreatedOn,
          nameStarts,
          sortBy: sortBy || 'created_desc',
          scrollPosition: scrollPos,
          timestamp: Date.now()
        }));
      }
    };

    // Save on unmount (when navigating away) instead of on every scroll pixel to prevent freezing
    return () => {
      saveState();
    };
  }, [leads, offset, totalCount, search, statusFilter, phoneSearch, assignedStaffFilter, viewType, dateFrom, dateTo, createdMonth, selectedCreatedOn, nameStarts, sortBy]);

  useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD' || user?.role === 'SALES_TEAM' || user?.role === 'PROCESSING' || user?.role === 'STAFF' || user?.role === 'HR') {
      fetchStaffList();
    }
  }, [user]);

  useEffect(() => {
    setSelectedLeadIds((prev) => prev.filter((id) => leads.some((lead) => lead.id === id)));
  }, [leads]);

  useEffect(() => {
    // Close assign dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (assigningLeadId && !event.target.closest('.quick-assign-dropdown') && !event.target.closest('.btn-assign')) {
        setAssigningLeadId(null);
        setAssignStaffId('');
      }
    };

    if (assigningLeadId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [assigningLeadId]);

  const fetchLeads = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }

      const token = localStorage.getItem('token');
      const searchVal = searchParams.get('search');
      const phoneVal = searchParams.get('phone');
      const statusVal = searchParams.get('status');
      const assigned_staff_id = searchParams.get('assigned_staff_id');
      const viewTypeVal = searchParams.get('viewType');
      const createdFrom = searchParams.get('created_from');
      const createdTo = searchParams.get('created_to');
      const createdMonthVal = searchParams.get('created_month');
      const createdOnVal = searchParams.get('created_on');
      const sortVal = searchParams.get('sort') || 'created_desc';
      const followUpDate = searchParams.get('follow_up_date');
      const followUpOverdue = searchParams.get('follow_up_overdue');
      const createdToday = searchParams.get('created_today');
      const leadSourceType = searchParams.get('lead_source_type');
      const nameStartsVal = searchParams.get('name_starts');

      const params = new URLSearchParams();
      if (searchVal) params.append('search', searchVal);
      if (phoneVal) params.append('phone', phoneVal);
      if (nameStartsVal) params.append('name_starts', nameStartsVal);
      if (statusVal) params.append('status', statusVal);
      if (assigned_staff_id) params.append('assigned_staff_id', assigned_staff_id);
      if (viewTypeVal && viewTypeVal !== 'all') params.append('viewType', viewTypeVal);
      if (createdOnVal) params.append('created_on', createdOnVal);
      else if (createdMonthVal) params.append('created_month', createdMonthVal);
      else {
        if (createdFrom) params.append('created_from', createdFrom);
        if (createdTo) params.append('created_to', createdTo);
      }
      if (sortVal) params.append('sort', sortVal);
      if (followUpDate) params.append('follow_up_date', followUpDate);
      if (followUpOverdue) params.append('follow_up_overdue', followUpOverdue);
      if (createdToday === 'true') params.append('created_today', 'true');
      if (leadSourceType) params.append('lead_source_type', leadSourceType);

      const currentOffset = reset ? 0 : offset;
      params.append('limit', LEADS_PER_PAGE.toString());
      params.append('offset', currentOffset.toString());

      const response = await axios.get(`${API_BASE_URL}/api/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { leads: leadsData, totalCount: serverTotal } = response.data;

      // DO NOT sort alphabetically. Rely on the backend's date-based sorting 
      // which prioritizes the latest assignments and creations.
      const newLeads = leadsData || [];

      if (reset) {
        setLeads(newLeads);
      } else {
        setLeads(prev => [...prev, ...newLeads]);
      }

      setTotalCount(serverTotal || 0);
    } catch (error) {
      console.error('Error fetching leads:', error);
      if (error.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreLeads = () => {
    const nextOffset = offset + LEADS_PER_PAGE;
    setOffset(nextOffset);
    // Use the nextOffset directly since state updates are async
    fetchLeadsByOffset(nextOffset);
  };

  const fetchLeadsByOffset = async (newOffset) => {
    try {
      setLoadingMore(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      const searchVal = searchParams.get('search');
      const phoneVal = searchParams.get('phone');
      const statusVal = searchParams.get('status');
      const assigned_staff_id = searchParams.get('assigned_staff_id');
      const viewTypeVal = searchParams.get('viewType');
      const createdFrom = searchParams.get('created_from');
      const createdTo = searchParams.get('created_to');
      const createdMonthVal = searchParams.get('created_month');
      const createdOnVal = searchParams.get('created_on');
      const sortVal = searchParams.get('sort') || 'created_desc';
      const followUpDate = searchParams.get('follow_up_date');
      const followUpOverdue = searchParams.get('follow_up_overdue');
      const createdToday = searchParams.get('created_today');
      const leadSourceType = searchParams.get('lead_source_type');
      const nameStartsVal = searchParams.get('name_starts');

      if (searchVal) params.append('search', searchVal);
      if (phoneVal) params.append('phone', phoneVal);
      if (nameStartsVal) params.append('name_starts', nameStartsVal);
      if (statusVal) params.append('status', statusVal);
      if (assigned_staff_id) params.append('assigned_staff_id', assigned_staff_id);
      if (viewTypeVal && viewTypeVal !== 'all') params.append('viewType', viewTypeVal);
      if (createdOnVal) params.append('created_on', createdOnVal);
      else if (createdMonthVal) params.append('created_month', createdMonthVal);
      else {
        if (createdFrom) params.append('created_from', createdFrom);
        if (createdTo) params.append('created_to', createdTo);
      }
      if (sortVal) params.append('sort', sortVal);
      if (followUpDate) params.append('follow_up_date', followUpDate);
      if (followUpOverdue) params.append('follow_up_overdue', followUpOverdue);
      if (createdToday === 'true') params.append('created_today', 'true');
      if (leadSourceType) params.append('lead_source_type', leadSourceType);

      params.append('limit', LEADS_PER_PAGE.toString());
      params.append('offset', newOffset.toString());

      const response = await axios.get(`${API_BASE_URL}/api/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { leads: leadsData, totalCount: serverTotal } = response.data;
      const newLeads = leadsData || []; // No alphabetical sorting

      setLeads(prev => {
        // Avoid duplicates if user clicks twice fast
        const existingIds = new Set(prev.map(l => l.id));
        const filteredNew = newLeads.filter(l => !existingIds.has(l.id));
        return [...prev, ...filteredNew];
      });
      setTotalCount(serverTotal || 0);
    } catch (error) {
      console.error('Error loading more:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const navigateToLead = (leadId) => {
    // Aggressively save the clicked ID to guarantee bulletproof scroll-into-view later
    if (leads.length > 0) {
      const container = document.querySelector('.leads-table-container');
      sessionStorage.setItem('leadsPageState', JSON.stringify({
        leads,
        offset,
        totalCount,
        search,
        statusFilter,
        phoneSearch,
        assignedStaffFilter,
        viewType,
        dateFrom,
        dateTo,
        createdMonth,
        selectedCreatedOn,
        nameStarts,
        sortBy: sortBy || 'created_desc',
        clickedLeadId: leadId,
        scrollPosition: container ? container.scrollTop : 0,
        timestamp: Date.now()
      }));
    }
    navigate(`/leads/${leadId}`);
  };

  const isDueFollowUp = (lead) => {
    if (!lead.follow_up_date) return false;
    const today = new Date().toISOString().split('T')[0];
    const followDate = new Date(lead.follow_up_date).toISOString().split('T')[0];
    const isActiveStatus = lead.status !== 'Pending Lead' && lead.status !== 'Closed / Rejected';
    return followDate < today && isActiveStatus;
  };

  const handleMarkFollowUpCompleted = async (leadId) => {
    try {
      // Only mark status as completed, do not auto-update date
      await axios.put(`${API_BASE_URL}/api/leads/${leadId}`, {
        follow_up_status: 'Completed',
      });
      await fetchLeads(true);
    } catch (error) {
      alert(error.response?.data?.error || 'Error marking follow-up as completed');
    }
  };

  const fetchStaffList = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/leads/staff/list`);
      setStaffList(response.data || []);
    } catch (error) {
      console.error('Error fetching staff list:', error);
      setStaffList([]);
    }
  };

  const buildLeadsParamsWith = (overrides = {}) => {
    const s = overrides.searchInput !== undefined ? overrides.searchInput : searchInput;
    const ph = overrides.phoneSearchInput !== undefined ? overrides.phoneSearchInput : phoneSearchInput;
    const st = overrides.statusFilter !== undefined ? overrides.statusFilter : statusFilter;
    const asf = overrides.assignedStaffFilter !== undefined ? overrides.assignedStaffFilter : assignedStaffFilter;
    const vt = overrides.viewType !== undefined ? overrides.viewType : viewType;
    const sb = overrides.sortBy !== undefined ? overrides.sortBy : sortBy;
    const ctf = overrides.createdTodayFilter !== undefined ? overrides.createdTodayFilter : createdTodayFilter;
    const lst = overrides.leadSourceTypeFilter !== undefined ? overrides.leadSourceTypeFilter : leadSourceTypeFilter;
    const df = overrides.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const dt = overrides.dateTo !== undefined ? overrides.dateTo : dateTo;
    const cm = overrides.createdMonth !== undefined ? overrides.createdMonth : createdMonth;
    const co = overrides.selectedCreatedOn !== undefined ? overrides.selectedCreatedOn : selectedCreatedOn;
    const ns = overrides.nameStarts !== undefined ? overrides.nameStarts : nameStarts;

    const params = new URLSearchParams();
    if (s.trim()) params.set('search', s.trim());
    if (ph.trim()) params.set('phone', ph.trim());
    if (ns) params.set('name_starts', ns);
    if (st) params.set('status', st);
    if (asf) params.set('assigned_staff_id', asf);
    if (vt && vt !== 'all') params.set('viewType', vt);
    if (sb && sb !== 'created_desc') params.set('sort', sb);
    if (ctf) params.set('created_today', 'true');
    if (lst) params.set('lead_source_type', lst);
    if (co) {
      params.set('created_on', co);
    } else if (cm) {
      params.set('created_month', cm);
    } else {
      if (df) params.set('created_from', df);
      if (dt) params.set('created_to', dt);
    }
    return params;
  };

  const buildLeadsParams = () => buildLeadsParamsWith();

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPhoneSearch(phoneSearchInput.trim());
    navigate(`/leads?${buildLeadsParams().toString()}`);
  };

  const handleSearchInputChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handlePhoneSearchInputChange = (e) => {
    setPhoneSearchInput(e.target.value);
  };

  const handleStatusFilter = (status) => {
    setStatusFilter(status);
    const params = buildLeadsParams();
    if (status) params.set('status', status);
    else params.delete('status');
    navigate(`/leads?${params.toString()}`);
  };

  const formatDateAdded = (createdAt) => {
    if (!createdAt) return '-';
    const d = new Date(createdAt);
    return (
      <>
        <div style={{ fontWeight: 500 }}>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
      </>
    );
  };

  const handleStaffFilter = (staffId) => {
    setAssignedStaffFilter(staffId);
    const params = buildLeadsParams();
    if (staffId) params.set('assigned_staff_id', staffId);
    else params.delete('assigned_staff_id');
    navigate(`/leads?${params.toString()}`);
  };

  const handleDateFilter = (from, to) => {
    setDateFrom(from);
    setDateTo(to);
    setCreatedMonth('');
    setSelectedCreatedOn('');
    navigate(`/leads?${buildLeadsParamsWith({ dateFrom: from, dateTo: to, createdMonth: '', selectedCreatedOn: '' }).toString()}`);
  };

  const handleCreatedMonthChange = (month) => {
    setCreatedMonth(month);
    setSelectedCreatedOn('');
    setDateFrom('');
    setDateTo('');
    navigate(`/leads?${buildLeadsParamsWith({ createdMonth: month, selectedCreatedOn: '', dateFrom: '', dateTo: '' }).toString()}`);
  };

  const handleSingleCreatedOnChange = (day) => {
    setSelectedCreatedOn(day);
    setCreatedMonth('');
    setDateFrom('');
    setDateTo('');
    navigate(`/leads?${buildLeadsParamsWith({ selectedCreatedOn: day, createdMonth: '', dateFrom: '', dateTo: '' }).toString()}`);
  };

  const clearDateFilters = () => {
    setDateFrom('');
    setDateTo('');
    setCreatedMonth('');
    setSelectedCreatedOn('');
    navigate(`/leads?${buildLeadsParamsWith({ dateFrom: '', dateTo: '', createdMonth: '', selectedCreatedOn: '' }).toString()}`);
  };

  const handleNameStartsChange = (letter) => {
    setNameStarts(letter);
    navigate(`/leads?${buildLeadsParamsWith({ nameStarts: letter }).toString()}`);
  };

  const handleSortChange = (value) => {
    setSortBy(value);
    navigate(`/leads?${buildLeadsParamsWith({ sortBy: value }).toString()}`);
  };

  const handleViewTypeChange = (type) => {
    setViewType(type);
    if (type !== 'all') setStatusFilter('');
    const params = buildLeadsParams();
    if (type === 'all' && statusFilter) params.set('status', statusFilter);
    else if (type !== 'all') params.delete('status');
    if (type && type !== 'all') params.set('viewType', type);
    else params.delete('viewType');
    navigate(`/leads?${params.toString()}`);
  };

  const handleCreatedTodayFilter = (enabled) => {
    setCreatedTodayFilter(enabled);
    const params = buildLeadsParams();
    if (enabled) params.set('created_today', 'true');
    else params.delete('created_today');
    navigate(`/leads?${params.toString()}`);
  };

  const handleLeadSourceTypeFilter = (value) => {
    setLeadSourceTypeFilter(value);
    const params = buildLeadsParams();
    if (value) params.set('lead_source_type', value);
    else params.delete('lead_source_type');
    navigate(`/leads?${params.toString()}`);
  };

  const getUnifiedFilterValue = () => {
    if (createdTodayFilter) return 'today';
    if (viewType === 'new') return 'new';
    if (viewType === 'follow_up') return 'follow_up';
    if (leadSourceTypeFilter === 'manual') return 'manual';
    if (leadSourceTypeFilter === 'bulk_import') return 'bulk_import';
    return 'all';
  };

  const hasActiveFilters = useMemo(() => {
    if (getUnifiedFilterValue() !== 'all') return true;
    if (sortBy !== 'created_desc') return true;
    if (search.trim() || phoneSearch.trim()) return true;
    if (statusFilter) return true;
    if (assignedStaffFilter) return true;
    if (nameStarts) return true;
    if (dateFrom || dateTo || createdMonth || selectedCreatedOn) return true;
    return false;
  }, [
    search,
    phoneSearch,
    statusFilter,
    assignedStaffFilter,
    sortBy,
    nameStarts,
    dateFrom,
    dateTo,
    createdMonth,
    selectedCreatedOn,
    createdTodayFilter,
    viewType,
    leadSourceTypeFilter,
  ]);

  const handleUnifiedFilterChange = (value) => {
    setCreatedTodayFilter(value === 'today');
    setViewType(value === 'new' ? 'new' : value === 'follow_up' ? 'follow_up' : 'all');
    setLeadSourceTypeFilter(value === 'manual' ? 'manual' : value === 'bulk_import' ? 'bulk_import' : '');
    const params = new URLSearchParams(searchParams);
    params.delete('created_today');
    params.delete('viewType');
    params.delete('lead_source_type');
    params.delete('created_month');
    params.delete('created_on');
    params.delete('created_from');
    params.delete('created_to');
    if (value === 'today') params.set('created_today', 'true');
    if (value === 'new' || value === 'follow_up') params.set('viewType', value);
    if (value === 'manual' || value === 'bulk_import') params.set('lead_source_type', value);
    setCreatedMonth('');
    setSelectedCreatedOn('');
    setDateFrom('');
    setDateTo('');
    navigate(`/leads?${params.toString()}`);
  };

  const toggleLeadSelection = (leadId) => {
    setSelectedLeadIds((prev) => (
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    ));
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map((lead) => lead.id));
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignStaffId || selectedLeadIds.length === 0) return;
    try {
      setBulkAssignLoading(true);
      await axios.post(`${API_BASE_URL}/api/leads/bulk-assign`, {
        leadIds: selectedLeadIds,
        assigned_staff_id: Number(bulkAssignStaffId),
      });
      setSelectedLeadIds([]);
      setBulkAssignStaffId('');
      fetchLeads(true);
    } catch (error) {
      alert(error.response?.data?.error || 'Error assigning leads');
    } finally {
      setBulkAssignLoading(false);
    }
  };

  const handleLeadRowClick = (leadId, e) => {
    // Don't navigate if clicking on checkbox, button, or link
    if (e.target.closest('input[type="checkbox"]') ||
      e.target.closest('button') ||
      e.target.closest('a') ||
      e.target.closest('.quick-assign-dropdown')) {
      return;
    }
    navigate(`/leads/${leadId}`);
  };

  const handleBulkEdit = async () => {
    if (selectedLeadIds.length === 0) return;

    try {
      setBulkEditLoading(true);

      // Prepare update data - only include fields that have values
      const updateData = {};
      if (bulkEditData.status) updateData.status = bulkEditData.status;
      if (bulkEditData.priority) updateData.priority = bulkEditData.priority;
      if (bulkEditData.follow_up_date) updateData.follow_up_date = bulkEditData.follow_up_date;
      if (bulkEditData.follow_up_status) updateData.follow_up_status = bulkEditData.follow_up_status;

      if (Object.keys(updateData).length === 0 && (!bulkEditData.comment || bulkEditData.comment.trim() === '')) {
        alert('Please fill at least one field to update');
        setBulkEditLoading(false);
        return;
      }

      // For comments, we need to fetch each lead first to append to existing comment
      const updatePromises = selectedLeadIds.map(async (leadId) => {
        const leadUpdateData = { ...updateData };

        // If comment is provided, fetch the lead first to append comment
        if (bulkEditData.comment && bulkEditData.comment.trim() !== '') {
          try {
            const leadResponse = await axios.get(`${API_BASE_URL}/api/leads/${leadId}`);
            const existingComment = leadResponse.data.comment || '';
            // Append new comment to existing comment
            leadUpdateData.comment = existingComment
              ? `${existingComment} | ${bulkEditData.comment.trim()}`
              : bulkEditData.comment.trim();
          } catch (error) {
            console.error(`Error fetching lead ${leadId} for comment append:`, error);
            // If we can't fetch, just use the new comment
            leadUpdateData.comment = bulkEditData.comment.trim();
          }
        }

        return axios.put(`${API_BASE_URL}/api/leads/${leadId}`, leadUpdateData);
      });

      await Promise.all(updatePromises);

      const updatedCount = selectedLeadIds.length;
      setSelectedLeadIds([]);
      setBulkEditData({
        status: '',
        priority: '',
        comment: '',
        follow_up_date: '',
        follow_up_status: '',
      });
      setShowBulkEditModal(false);
      fetchLeads(true);
      alert(`Successfully updated ${updatedCount} lead(s)`);
    } catch (error) {
      console.error('Bulk edit error:', error);
      alert(error.response?.data?.error || 'Error updating leads. Some leads may not have been updated.');
    } finally {
      setBulkEditLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;

    if (window.confirm(`Move ${selectedLeadIds.length} selected lead(s) to the Recycle Bin? You can restore them from 'Recently Deleted'.`)) {
      try {
        setBulkAssignLoading(true);
        const token = localStorage.getItem('token');
        const response = await axios.post(
          `${API_BASE_URL}/api/leads/bulk-delete`,
          { leadIds: selectedLeadIds },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setSelectedLeadIds([]);
        sessionStorage.removeItem('leadsPageState');
        setOffset(0);
        fetchLeads(true);
        alert(`🗑 ${response.data.deletedCount || selectedLeadIds.length} lead(s) moved to Recycle Bin. Admins can restore them.`);
      } catch (error) {
        console.error('Bulk delete error:', error);
        alert(error.response?.data?.error || 'Failed to delete leads. You might not have permission.');
        sessionStorage.removeItem('leadsPageState');
        setOffset(0);
        fetchLeads(true);
      } finally {
        setBulkAssignLoading(false);
      }
    }
  };

  const handleQuickAssign = async (leadId) => {
    if (!assignStaffId) return;
    try {
      await axios.put(`${API_BASE_URL}/api/leads/${leadId}`, {
        assigned_staff_id: Number(assignStaffId),
      });
      setAssigningLeadId(null);
      setAssignStaffId('');
      fetchLeads(true);
      alert('Lead transferred successfully!');
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Error transferring lead';
      console.error('Transfer error:', error);
      alert(errorMessage);
    }
  };

  const handleExportToGoogleSheets = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/leads/export/csv?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      alert('CSV file downloaded! You can import this file into Google Sheets by:\n1. Opening Google Sheets\n2. File > Import\n3. Upload the CSV file');
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting leads. Please try again.');
    }
  };

  const handleViewLastImport = async () => {
    // Redirect to history modal instead of direct download
    setShowHistoryModal(true);
    fetchImportHistory();
  };

  const fetchImportHistory = async () => {
    try {
      setHistoryLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/leads/import-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImportHistory(response.data || []);
    } catch (error) {
      console.error('Error fetching import history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const downloadHistoryFile = async (importId, originalName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/leads/import-history/${importId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalName || 'imported_file.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to download file');
    }
  };

  const fetchTrashLeads = async () => {
    try {
      setTrashLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/leads/trash`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrashLeads(response.data || []);
      setSelectedTrashIds([]);
    } catch (error) {
      console.error('Error fetching trash:', error);
      setTrashLeads([]);
    } finally {
      setTrashLoading(false);
    }
  };

  const handleRestore = async () => {
    if (selectedTrashIds.length === 0) return;
    if (!window.confirm(`Restore ${selectedTrashIds.length} lead(s) back to the main list?`)) return;
    try {
      setTrashActionLoading(true);
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/api/leads/restore`, { leadIds: selectedTrashIds }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`✅ ${selectedTrashIds.length} lead(s) restored successfully!`);
      fetchTrashLeads();
      fetchLeads(true);
    } catch (error) {
      alert(error.response?.data?.error || 'Error restoring leads');
    } finally {
      setTrashActionLoading(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (selectedTrashIds.length === 0) return;
    if (!window.confirm(`⚠️ PERMANENTLY delete ${selectedTrashIds.length} lead(s)? This CANNOT be undone!`)) return;
    try {
      setTrashActionLoading(true);
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/api/leads/permanent-delete`, { leadIds: selectedTrashIds }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(`🔥 ${selectedTrashIds.length} lead(s) permanently deleted.`);
      fetchTrashLeads();
    } catch (error) {
      alert(error.response?.data?.error || 'Error deleting leads');
    } finally {
      setTrashActionLoading(false);
    }
  };

  const statusOptions = ['New', 'Unassigned', 'Direct Lead', 'Assigned', 'Contacted', 'Follow-up', 'Prospect', 'Pending Lead', 'Not Responding', 'Not Eligible', 'Not Interested', 'Converted', 'Closed', 'Registration Completed'];

  const getStatusColor = (status) => {
    const colors = {
      'New': '#34D399',
      'Unassigned': '#87CEEB',
      'Direct Lead': '#FBBF24',
      'Assigned': '#cbd5e1',
      'Contacted': '#8b5cf6',
      'Follow-up': '#E6E6FA',
      'Prospect': '#B0E0E6',
      'Pending Lead': '#DDA0DD',
      'Not Responding': '#FCD34D',
      'Not Eligible': '#FCA5A5',
      'Not Interested': '#D3D3D3',
      'Converted': '#10b981',
      'Closed': '#ef4444',
      'Registration Completed': '#86EFAC',
    };
    return colors[status] || '#87CEEB';
  };

  const getStatusTextColor = (status) => {
    const colors = {
      'New': '#065F46',
      'Unassigned': '#1e40af',
      'Direct Lead': '#92400e',
      'Assigned': '#334155',
      'Contacted': '#5b21b6',
      'Follow-up': '#6b21a8',
      'Prospect': '#0e7490',
      'Pending Lead': '#7c2d12',
      'Not Responding': '#92400e',
      'Not Eligible': '#991B1B',
      'Not Interested': '#374151',
      'Converted': '#166534',
      'Closed': '#991B1B',
      'Registration Completed': '#166534',
    };
    return colors[status] || '#1e40af';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'hot': '#ef4444',
      'warm': '#f59e0b',
      'cold': '#3b82f6',
      'not interested': '#6b7280',
      'not eligible': '#dc2626',
    };
    return colors[priority] || '#6b7280';
  };

  const formatPriority = (priority) => {
    if (!priority) return '-';
    return priority.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (loading) {
    return <div className="leads-loading">Loading leads...</div>;
  }

  const isAdmin = user?.role === 'ADMIN';
  const isHr = user?.role === 'HR';
  const canManageLeads = user?.role === 'ADMIN' || user?.role === 'SALES_TEAM_HEAD' || user?.role === 'SALES_TEAM' || user?.role === 'PROCESSING' || user?.role === 'STAFF' || user?.role === 'HR';
  const allSelected = leads.length > 0 && selectedLeadIds.length === leads.length;
  // Avoid duplicate <option value> for admins: "My leads only" uses same id as their staff row
  const staffFilterListExcludingSelf =
    isAdmin && user?.id != null
      ? staffList.filter((s) => Number(s.id) !== Number(user.id))
      : staffList;

  return (
    <div className="leads-page">
      <div className="leads-header">
        <button className="leads-back-btn" onClick={() => navigate(isHr ? '/hr' : '/')}>
          <FiArrowLeft /> Back to Dashboard
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h1>{isHr ? 'My Leads' : 'Clients (Leads)'}</h1>
            {!isHr && (
              <button
                className="header-history-btn"
                onClick={() => { setShowHistoryModal(true); fetchImportHistory(); }}
                title="View full history of imported Excel files"
              >
                <FiClock /> Import History
              </button>
            )}
            {isAdmin && (
              <button
                className="header-trash-btn"
                onClick={() => { setShowTrashModal(true); fetchTrashLeads(); }}
                title="View recently deleted leads"
              >
                <FiTrash2 /> Recently Deleted
              </button>
            )}
            <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#6b7280', fontWeight: 500, backgroundColor: '#f3f4f6', padding: '4px 10px', borderRadius: '15px' }}>
              Showing {leads.length} of {totalCount} leads
            </div>
          </div>
        </div>
      </div>

      {/* Follow-up filter banner */}
      {(searchParams.get('follow_up_date') === 'today' || searchParams.get('follow_up_overdue') === 'true') && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          marginBottom: '12px',
          backgroundColor: searchParams.get('follow_up_overdue') === 'true' ? '#fef3c7' : '#dbeafe',
          borderRadius: '8px',
          border: `1px solid ${searchParams.get('follow_up_overdue') === 'true' ? '#f59e0b' : '#3b82f6'}`,
        }}>
          <FiCalendar style={{ flexShrink: 0, color: searchParams.get('follow_up_overdue') === 'true' ? '#b45309' : '#2563eb' }} />
          <span style={{ fontWeight: 500, color: '#1f2937' }}>
            {searchParams.get('follow_up_overdue') === 'true'
              ? 'Showing overdue follow-ups'
              : "Showing today's follow-ups"}
          </span>
          <button
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.delete('follow_up_date');
              params.delete('follow_up_overdue');
              navigate({ pathname: '/leads', search: params.toString() || undefined });
            }}
            style={{
              marginLeft: 'auto',
              padding: '4px 12px',
              fontSize: '13px',
              backgroundColor: 'rgba(0,0,0,0.06)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Controls — collapsible filter & sort */}
      <div className="leads-controls-section">
        <div className="leads-filter-disclosure">
          <button
            type="button"
            className="leads-filter-disclosure__toggle"
            id="leads-filter-disclosure-btn"
            aria-expanded={filtersPanelOpen}
            aria-controls="leads-filters-expandable"
            onClick={() => setFiltersPanelOpen((o) => !o)}
          >
            <span className="leads-filter-disclosure__toggle-main">
              <FiFilter className="leads-filter-disclosure__toggle-icon" aria-hidden />
              <span className="leads-filter-disclosure__title">Filter and sort leads</span>
              {hasActiveFilters && (
                <span className="leads-filter-disclosure__badge">Filters on</span>
              )}
            </span>
            <FiChevronDown
              className={`leads-filter-disclosure__chevron ${filtersPanelOpen ? 'leads-filter-disclosure__chevron--open' : ''}`}
              aria-hidden
            />
          </button>
          <div
            id="leads-filters-expandable"
            role="region"
            aria-labelledby="leads-filter-disclosure-btn"
            className="leads-filter-disclosure__panel"
            hidden={!filtersPanelOpen}
          >
            <div className="leads-filter-panel">
          <div className="leads-filter-toolbar" aria-label="Quick views and sorting">
            <div className="leads-filter-field">
              <label className="leads-filter-label" htmlFor="leads-quick-filter">Quick filter</label>
              <select
                id="leads-quick-filter"
                className="leads-filter-select"
                value={getUnifiedFilterValue()}
                onChange={(e) => handleUnifiedFilterChange(e.target.value)}
              >
                <option value="all">All Leads</option>
                <option value="today">Today's Leads</option>
                {user?.role !== 'SALES_TEAM' && (
                  <>
                    <option value="new">New (No Comments)</option>
                    <option value="follow_up">Follow Up (Active)</option>
                  </>
                )}
                <option value="manual">Manual</option>
                <option value="bulk_import">Bulk Import</option>
              </select>
            </div>
            <div className="leads-filter-field">
              <label className="leads-filter-label" htmlFor="leads-sort">Sort</label>
              <select
                id="leads-sort"
                className="leads-filter-select leads-filter-select--compact"
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                title="Sort leads"
              >
                <option value="created_desc">Newest first</option>
                <option value="created_asc">Oldest first</option>
                <option value="updated_desc">Latest updated</option>
                <option value="updated_asc">Oldest updated</option>
              </select>
            </div>
            {canManageLeads && !isHr && (
              <div className="leads-filter-field">
                <label className="leads-filter-label" htmlFor="leads-staff">Staff</label>
                <select
                  id="leads-staff"
                  className="leads-filter-select staff-filter-select leads-filter-select--compact"
                  value={assignedStaffFilter}
                  onChange={(e) => handleStaffFilter(e.target.value)}
                  title={isAdmin ? 'All leads, only leads assigned to you, or filter by assignee' : 'Filter by assigned staff'}
                >
                  <option value="">{isAdmin ? 'All leads' : 'All Staff'}</option>
                  {isAdmin && user?.id != null && (
                    <option value={String(user.id)}>My leads only</option>
                  )}
                  {staffFilterListExcludingSelf.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="leads-filter-field leads-filter-field--export">
              <label className="leads-filter-label leads-filter-label--spacer" aria-hidden="true">&nbsp;</label>
              <button
                type="button"
                className="export-btn leads-filter-export-btn"
                onClick={handleExportToGoogleSheets}
                title="Export to CSV (can be imported to Google Sheets)"
              >
                <FiDownload /> Export
              </button>
            </div>
          </div>

          <div className="leads-filter-panel__block">
            <span className="leads-filter-label">Status</span>
            <div className="status-filters">
              <button
                type="button"
                className={`filter-btn ${statusFilter === '' ? 'active' : ''}`}
                onClick={() => handleStatusFilter('')}
              >
                All
              </button>
              {statusOptions.map((status) => (
                <button
                  type="button"
                  key={status}
                  className={`filter-btn ${statusFilter === status ? 'active' : ''}`}
                  onClick={() => handleStatusFilter(status)}
                  style={{
                    borderColor: statusFilter === status ? getStatusColor(status) : '#e5e7eb',
                    backgroundColor: statusFilter === status ? getStatusColor(status) : '#FFF8E7',
                    color: statusFilter === status ? (['Closed', 'Closed / Rejected'].includes(status) ? '#666' : '#333') : '#6b7280',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="leads-filter-card">
            <h3 className="leads-filter-card__heading">Search</h3>
            <p className="leads-filter-card__hint">Find leads by part of a name or phone number, then press Apply.</p>
            <form onSubmit={handleSearch} className="leads-filter-panel__search leads-filter-panel__search--stacked">
              <div className="leads-filter-search-field">
                <FiSearch className="leads-filter-search-field__icon" aria-hidden />
                <input
                  type="text"
                  placeholder="Name contains…"
                  value={searchInput}
                  onChange={handleSearchInputChange}
                  aria-label="Search lead by name"
                />
              </div>
              <div className="leads-filter-search-field">
                <FiSearch className="leads-filter-search-field__icon" aria-hidden />
                <input
                  type="text"
                  placeholder="Phone contains…"
                  value={phoneSearchInput}
                  onChange={handlePhoneSearchInputChange}
                  aria-label="Search by phone"
                />
              </div>
              <button type="submit" className="leads-filter-apply-btn">
                Apply search
              </button>
            </form>
          </div>

          <div className="leads-filter-card">
            <h3 className="leads-filter-card__heading">First letter of name</h3>
            <p className="leads-filter-card__hint">Optional. Narrow the list by the first character of the lead name.</p>
            <select
              id="leads-name-letter"
              className="leads-filter-select leads-filter-select--full"
              value={nameStarts || ''}
              onChange={(e) => handleNameStartsChange(e.target.value)}
              aria-label="Filter by first letter of lead name"
            >
              <option value="">Any — no letter filter</option>
              {NAME_ALPHABET.map((L) => (
                <option key={L} value={L}>
                  Starts with {L}
                </option>
              ))}
              <option value="0">Starts with a number (0–9)</option>
              <option value="#">Starts with symbol or other (#)</option>
            </select>
          </div>

          <div className="leads-filter-card leads-filter-card--dates">
            <h3 className="leads-filter-card__heading">
              <FiCalendar className="leads-filter-card__heading-icon" aria-hidden />
              Created date
            </h3>
            <p className="leads-filter-card__hint">Use one approach below (range, month, or single day). They replace each other.</p>
            <div className="leads-filter-date-rows">
              <div className="leads-filter-date-row">
                <span className="leads-filter-date-row__label">Between two dates</span>
                <div className="leads-filter-date-row__inputs">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => handleDateFilter(e.target.value, dateTo)}
                    title="Created from"
                    aria-label="Created from date"
                  />
                  <span className="leads-filter-date-sep">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => handleDateFilter(dateFrom, e.target.value)}
                    title="Created to"
                    aria-label="Created to date"
                  />
                </div>
              </div>
              <div className="leads-filter-date-row">
                <span className="leads-filter-date-row__label">Whole calendar month</span>
                <input
                  type="month"
                  value={createdMonth}
                  onChange={(e) => handleCreatedMonthChange(e.target.value)}
                  title="Filter by calendar month"
                  aria-label="Filter by created month"
                />
              </div>
              <div className="leads-filter-date-row">
                <span className="leads-filter-date-row__label">Single calendar day</span>
                <input
                  type="date"
                  value={selectedCreatedOn}
                  onChange={(e) => handleSingleCreatedOnChange(e.target.value)}
                  title="Leads created on this date only"
                  aria-label="Filter by single created date"
                />
              </div>
              {(dateFrom || dateTo || createdMonth || selectedCreatedOn) && (
                <button type="button" className="leads-filter-clear-dates" onClick={clearDateFilters}>
                  Clear date filters
                </button>
              )}
            </div>
          </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Assign Bar */}
      {canManageLeads && selectedLeadIds.length > 0 && (
        <div className="bulk-assign-bar">
          <div className="bulk-assign-info">
            {selectedLeadIds.length} lead{selectedLeadIds.length !== 1 ? 's' : ''} selected
          </div>
          <div className="bulk-assign-controls" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              className="bulk-edit-button"
              onClick={() => setShowBulkEditModal(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              <FiEdit /> Edit Details
            </button>
            <select
              className="bulk-assign-select"
              value={bulkAssignStaffId}
              onChange={(e) => setBulkAssignStaffId(e.target.value)}
            >
              <option value="">{isAdmin ? 'Select staff to assign...' : 'Select staff to transfer to...'}</option>
              {staffList.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
            <button
              className="bulk-assign-button"
              onClick={handleBulkAssign}
              disabled={!bulkAssignStaffId || bulkAssignLoading}
            >
              {bulkAssignLoading ? (isAdmin ? 'Assigning...' : 'Transferring...') : (isAdmin ? 'Assign Selected' : 'Transfer Selected')}
            </button>
            <button
              className="bulk-delete-button"
              onClick={handleBulkDelete}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: 500,
                marginLeft: '10px'
              }}
            >
              <FiTrash2 /> Delete
            </button>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <div className="modal-overlay" onClick={() => !bulkEditLoading && setShowBulkEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
            <h2 style={{ marginTop: 0 }}>Edit {selectedLeadIds.length} Lead{selectedLeadIds.length !== 1 ? 's' : ''}</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Update the fields below. Only filled fields will be updated for all selected leads.
            </p>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Status</label>
              <select
                value={bulkEditData.status}
                onChange={(e) => setBulkEditData({ ...bulkEditData, status: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">-- Keep Current --</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Priority</label>
              <select
                value={bulkEditData.priority}
                onChange={(e) => setBulkEditData({ ...bulkEditData, priority: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">-- Keep Current --</option>
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
                <option value="not interested">Not Interested</option>
                <option value="not eligible">Not Eligible</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Comment (will be appended to existing comments)</label>
              <textarea
                value={bulkEditData.comment}
                onChange={(e) => setBulkEditData({ ...bulkEditData, comment: e.target.value })}
                placeholder="Add a comment to all selected leads..."
                rows="3"
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', resize: 'vertical' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Follow-up Date</label>
              <input
                type="date"
                value={bulkEditData.follow_up_date}
                onChange={(e) => setBulkEditData({ ...bulkEditData, follow_up_date: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Follow-up Status</label>
              <select
                value={bulkEditData.follow_up_status}
                onChange={(e) => setBulkEditData({ ...bulkEditData, follow_up_status: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">-- Keep Current --</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Skipped">Skipped</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkEditData({
                    status: '',
                    priority: '',
                    comment: '',
                    follow_up_date: '',
                    follow_up_status: '',
                  });
                }}
                disabled={bulkEditLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={handleBulkEdit}
                disabled={bulkEditLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                {bulkEditLoading ? 'Updating...' : 'Update Selected Leads'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Import History</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
              >&times;</button>
            </div>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Loading history...</div>
            ) : importHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>No import history found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                      <th style={{ padding: '12px' }}>Date</th>
                      <th style={{ padding: '12px' }}>Filename</th>
                      <th style={{ padding: '12px' }}>Total</th>
                      <th style={{ padding: '12px' }}>Success</th>
                      <th style={{ padding: '12px' }}>Skipped</th>
                      <th style={{ padding: '12px' }}>Errors</th>
                      <th style={{ padding: '12px' }}>By</th>
                      <th style={{ padding: '12px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                        <td style={{ padding: '12px' }}>{new Date(item.created_at).toLocaleString()}</td>
                        <td style={{ padding: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.original_filename}>
                          {item.original_filename}
                        </td>
                        <td style={{ padding: '12px' }}><strong>{item.total_rows}</strong></td>
                        <td style={{ padding: '12px', color: 'green' }}>{item.successful_rows}</td>
                        <td style={{ padding: '12px', color: 'orange' }}>{item.skipped_rows}</td>
                        <td style={{ padding: '12px', color: 'red' }}>{item.error_rows}</td>
                        <td style={{ padding: '12px' }}>{item.creator_name || 'System'}</td>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => downloadHistoryFile(item.id, item.original_filename)}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <FiDownload size={14} /> Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                className="btn-secondary"
                onClick={() => setShowHistoryModal(false)}
                style={{ padding: '8px 20px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trash / Recycle Bin Modal */}
      {showTrashModal && (
        <div className="modal-overlay" onClick={() => !trashActionLoading && setShowTrashModal(false)}>
          <div className="modal-content trash-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', width: '96%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FiTrash2 style={{ color: '#ef4444' }} /> Recently Deleted Leads
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#6b7280' }}>
                  Leads are shown latest deleted first. Restore or permanently delete them.
                </p>
              </div>
              <button onClick={() => setShowTrashModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}>&times;</button>
            </div>

            {/* Trash Action Bar */}
            {selectedTrashIds.length > 0 && (
              <div className="trash-action-bar">
                <span className="trash-selection-count">{selectedTrashIds.length} lead{selectedTrashIds.length !== 1 ? 's' : ''} selected</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="trash-btn-restore"
                    onClick={handleRestore}
                    disabled={trashActionLoading}
                  >
                    &#x267B; {trashActionLoading ? 'Working...' : 'Restore Selected'}
                  </button>
                  <button
                    className="trash-btn-permanent"
                    onClick={handlePermanentDelete}
                    disabled={trashActionLoading}
                  >
                    &#x1F525; {trashActionLoading ? 'Working...' : 'Delete Permanently'}
                  </button>
                </div>
              </div>
            )}

            {trashLoading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#x1F5D1;</div>
                Loading deleted leads...
              </div>
            ) : trashLeads.length === 0 ? (
              <div className="trash-empty-state">
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#x1F389;</div>
                <div style={{ fontWeight: 600, fontSize: '18px', marginBottom: '6px' }}>Recycle Bin is Empty</div>
                <div style={{ color: '#9ca3af', fontSize: '14px' }}>No leads have been deleted recently.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="trash-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedTrashIds.length === trashLeads.length && trashLeads.length > 0}
                          onChange={() => {
                            if (selectedTrashIds.length === trashLeads.length) {
                              setSelectedTrashIds([]);
                            } else {
                              setSelectedTrashIds(trashLeads.map(l => l.id));
                            }
                          }}
                        />
                      </th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Assigned To</th>
                      <th style={{ minWidth: '140px' }}>Deleted At</th>
                      <th>Deleted By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trashLeads.map((lead) => (
                      <tr key={lead.id} className={selectedTrashIds.includes(lead.id) ? 'trash-row-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTrashIds.includes(lead.id)}
                            onChange={() => {
                              setSelectedTrashIds(prev =>
                                prev.includes(lead.id) ? prev.filter(id => id !== lead.id) : [...prev, lead.id]
                              );
                            }}
                          />
                        </td>
                        <td style={{ fontWeight: 500 }}>{lead.name}</td>
                        <td style={{ color: '#6b7280', fontSize: '13px' }}>
                          {lead.phone_country_code} {lead.phone_number}
                        </td>
                        <td>
                          <span className="status-badge" style={{
                            backgroundColor: getStatusColor(lead.status),
                            color: getStatusTextColor(lead.status),
                            border: `1px solid ${getStatusTextColor(lead.status)}`,
                            fontWeight: 500, fontSize: '12px',
                          }}>
                            {lead.status}
                          </span>
                        </td>
                        <td style={{ color: '#8B6914', fontWeight: lead.assigned_staff_name ? 600 : 400 }}>
                          {lead.assigned_staff_name || <span style={{ color: '#9ca3af' }}>Unassigned</span>}
                        </td>
                        <td style={{ fontSize: '13px', color: '#6b7280' }}>
                          <div>{new Date(lead.deleted_at).toLocaleDateString()}</div>
                          <div style={{ fontSize: '11px' }}>{new Date(lead.deleted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td style={{ fontSize: '13px', color: '#374151' }}>{lead.deleted_by_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={() => setShowTrashModal(false)} style={{ padding: '8px 20px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Details Modal */}


      {/* Leads Table */}
      <div className="leads-table-container">
        {leads.length === 0 ? (
          <div className="no-leads">No leads found</div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                {canManageLeads && (
                  <th className="checkbox-column" style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectAll();
                      }}
                    />
                  </th>
                )}
                <th className="sticky-name" style={{ minWidth: '150px' }}>Name</th>
                <th style={{ minWidth: '130px' }}>Phone</th>
                <th style={{ minWidth: '180px' }}>Email</th>
                <th style={{ width: '100px' }}>Lead Status</th>
                <th style={{ width: '110px' }}>Date Added</th>
                <th style={{ width: '110px' }}>Follow-up Date</th>
                <th style={{ minWidth: '200px' }}>Source</th>
                <th style={{ width: '80px' }}>Priority</th>
                <th style={{ width: '120px', fontWeight: 600, color: '#8B6914' }}>Assigned To</th>
                <th style={{ width: '110px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, index) => (
                <tr
                  key={lead.id}
                  id={`lead-row-${lead.id}`}
                  onClick={(e) => {
                    const isAction = e.target.closest('button') || e.target.closest('input[type="checkbox"]') || e.target.closest('.quick-assign-dropdown') || e.target.closest('.dropdown-icon');
                    if (!isAction) navigateToLead(lead.id);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {canManageLeads && (
                    <td className="checkbox-column">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleLeadSelection(lead.id);
                        }}
                      />
                    </td>
                  )}
                  <td className="name-cell sticky-name" title={lead.name}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</span>
                      {lead.has_excel_data && (
                        <button
                          className="btn-excel-details"
                          title="View original Excel row data"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExcelModal({ open: true, data: null, loading: true, leadName: lead.name });
                            axios.get(`${API_BASE_URL}/api/leads/${lead.id}/excel-details`)
                              .then(res => setExcelModal(m => ({ ...m, data: res.data.excel_row_data, loading: false })))
                              .catch(() => setExcelModal(m => ({ ...m, loading: false, data: null })));
                          }}
                        >
                          <FiGrid size={12} /> Excel
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ maxWidth: '130px' }} title={`${lead.phone_country_code || ''} ${lead.phone_number || ''}${lead.secondary_phone_number ? '\nSec: ' + lead.secondary_phone_number : ''}`}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(() => {
                        const rawPhone = `${lead.phone_country_code || ''} ${lead.phone_number || ''}`;
                        const cleanPhone = rawPhone.replace(/^(yes|no)([\s-:]+)?/i, '').trim();
                        return cleanPhone || '-';
                      })()}
                    </div>
                    {lead.secondary_phone_number && (
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Sec: {lead.secondary_phone_number}
                      </div>
                    )}
                  </td>
                  <td style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={lead.email || ''}>
                    {lead.email || '-'}
                  </td>
                  <td>
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: getStatusColor(lead.status),
                        color: getStatusTextColor(lead.status),
                        border: `1px solid ${getStatusTextColor(lead.status)}`,
                        fontWeight: 500,
                      }}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td>
                    <div className="date-cell" title={lead.created_at ? new Date(lead.created_at).toLocaleString() : ''}>
                      {formatDateAdded(lead.created_at)}
                    </div>
                  </td>
                  <td>
                    {lead.follow_up_date ? (
                      <div className="date-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FiCalendar style={{ opacity: 0.6 }} />
                          {new Date(lead.follow_up_date).toLocaleDateString()}
                        </div>
                        {isDueFollowUp(lead) && (user?.role === 'STAFF' || user?.role === 'SALES_TEAM' || user?.role === 'PROCESSING') && (
                          <button
                            className="btn-mark-complete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkFollowUpCompleted(lead.id);
                            }}
                            title="Mark follow-up as completed"
                          >
                            <FiCheck /> Complete
                          </button>
                        )}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <div className="comment-cell" title={lead.source || ''}>
                      {(() => {
                        const rawSource = lead.source || '';
                        // Remove "Yes", "No", "Maybe" with separators like " - ", " : ", " ", etc.
                        const cleanSource = rawSource.replace(/^(yes|no|maybe)([\s-:]+)?/i, '').trim();
                        return cleanSource || '-';
                      })()}
                    </div>
                  </td>
                  <td>
                    {lead.priority ? (
                      <span
                        className="priority-badge"
                        style={{
                          backgroundColor: `${getPriorityColor(lead.priority)}20`,
                          color: getPriorityColor(lead.priority),
                        }}
                      >
                        {formatPriority(lead.priority)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <span className="assigned-staff-cell" style={{
                      fontWeight: lead.assigned_staff_name ? 600 : 400,
                      color: lead.assigned_staff_name ? '#8B6914' : '#9ca3af',
                      fontSize: '14px',
                      padding: '4px 8px',
                      backgroundColor: lead.assigned_staff_name ? '#FFF4D6' : 'transparent',
                      borderRadius: '4px',
                      display: 'inline-block',
                    }}>
                      {lead.assigned_staff_name || 'Unassigned'}
                    </span>
                  </td>
                  <td className="leads-actions-cell">
                    <div className="action-buttons-row">
                      {canManageLeads && (
                        <button
                          className="btn-assign"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssigningLeadId(lead.id);
                            setAssignStaffId(lead.assigned_staff_id ? String(lead.assigned_staff_id) : '');
                          }}
                          title={isAdmin ? 'Assign Lead' : 'Transfer Lead'}
                        >
                          <FiUser /> {isAdmin ? 'Assign' : 'Transfer'}
                        </button>
                      )}
                      <button
                        className="btn-view"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToLead(lead.id);
                        }}
                      >
                        <FiEdit2 /> View
                      </button>
                      {canManageLeads && (
                        <button
                          className="btn-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Move lead "${lead.name}" to the Recycle Bin? You can restore it from 'Recently Deleted'.`)) {
                              axios.delete(`${API_BASE_URL}/api/leads/${lead.id}`, {
                                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                              })
                                .then(() => {
                                  fetchLeads(true);
                                  alert('Lead moved to Recycle Bin successfully');
                                })
                                .catch(error => {
                                  console.error('Delete error:', error);
                                  alert(error.response?.data?.error || 'Failed to delete lead');
                                });
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#fee2e2',
                            color: '#ef4444',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '13px',
                            fontWeight: 500,
                            marginLeft: '8px'
                          }}
                          title="Delete Lead"
                        >
                          <FiTrash2 /> Delete
                        </button>
                      )}
                    </div>
                    {canManageLeads && assigningLeadId === lead.id && (
                      <div className="quick-assign-dropdown">
                        <select
                          className="quick-assign-select"
                          value={assignStaffId}
                          onChange={(e) => setAssignStaffId(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">{isAdmin ? 'Select staff...' : 'Select staff to transfer to...'}</option>
                          {staffList.map((staff) => (
                            <option key={staff.id} value={String(staff.id)}>
                              {staff.name}
                            </option>
                          ))}
                        </select>
                        <div className="quick-assign-actions">
                          <button
                            className="btn-assign-confirm"
                            onClick={() => handleQuickAssign(lead.id)}
                            disabled={!assignStaffId}
                          >
                            {isAdmin ? 'Assign' : 'Transfer'}
                          </button>
                          <button
                            className="btn-assign-cancel"
                            onClick={() => {
                              setAssigningLeadId(null);
                              setAssignStaffId('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination / Load More UI */}
        {leads.length > 0 && leads.length < totalCount && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0', borderTop: '1px solid #eef2f7' }}>
            <button
              className="btn-load-more"
              onClick={loadMoreLeads}
              disabled={loadingMore}
              style={{
                padding: '12px 30px',
                backgroundColor: '#fff',
                border: '2px solid #3b82f6',
                color: '#3b82f6',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '15px',
                cursor: loadingMore ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(59, 130, 246, 0.1)'
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
            >
              {loadingMore ? (
                <>
                  <div className="loading-spinner-small" style={{ width: '16px', height: '16px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  Loading next batch...
                </>
              ) : (
                <>
                  <span>Load More Leads</span>
                  <span style={{ fontSize: '12px', opacity: 0.8 }}>({totalCount - leads.length} remaining)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Excel Details Modal */}
      {excelModal.open && (
        <div className="excel-modal-overlay" onClick={() => setExcelModal({ open: false, data: null, loading: false, leadName: '' })}>
          <div className="excel-modal" onClick={e => e.stopPropagation()}>
            <div className="excel-modal-header">
              <div>
                <h2><FiGrid /> Original Excel Data</h2>
                <p className="excel-modal-subtitle">{excelModal.leadName}</p>
              </div>
              <button className="excel-modal-close" onClick={() => setExcelModal({ open: false, data: null, loading: false, leadName: '' })}>
                <FiX />
              </button>
            </div>
            <div className="excel-modal-body">
              {excelModal.loading && (
                <div className="excel-modal-loading">Loading Excel data...</div>
              )}
              {!excelModal.loading && !excelModal.data && (
                <div className="excel-modal-empty">No Excel data found for this lead.</div>
              )}
              {!excelModal.loading && excelModal.data && (
                <table className="excel-data-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(excelModal.data)
                      .filter(([, val]) => val !== '' && val !== null && val !== undefined)
                      .map(([key, val]) => (
                        <tr key={key}>
                          <td className="excel-col-name">{key}</td>
                          <td className="excel-col-value">{String(val)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;
