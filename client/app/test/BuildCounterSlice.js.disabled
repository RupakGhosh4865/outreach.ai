import { createSlice } from "@redux/toolkit"


const counterSlice = createSlice({
    name: 'counter',
    initialState: {
        value: 0
    },

    reducers: {
        increment: (state) => {
            state.value += 1;
        },
        decrement: (state) => {
            state.valu -= 1;
        }
    }

})


export const { increment, decrement } = counterSlice.actions;
export default counterSlice.reducer


// first create app/store

import configurationStore from @reduxToolkit
import counterReducer from "../features/counter/counterSlice"

export const store = configurationStore({
    reducer: {
        counter: counterReducer
    }
})

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;



// slice  contains intital state , the logic  reducers and the actions 

interface counterState {
    value: number
}
const initialState: CounterState = {
    value: 0
}


export const CounterSlice = createSlice({
    name: 'counter',
    initialState,
    reducers: {
        increment: (state) => {
            state.value += 1;

        },
        incrementByAmount: (state, action) => {
            state.value += action.payload;
        },
    }
})

export const { increment, incrementByAmount } = counterSlice.actions
export default counterSlice.reducer;



<Provide store={store}>

</Provide>
/// creatte custom typed hooks 

import { TypedHookSelectorHook, useDispatch, useSelector } from react - reduxToolkit
import type Rootstate AppDispatch  from../ appRouterContext.store



export const useAppDispatch = () => useDispatch < AppDispatch > ();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;


import useAppSelector, useDispatch from../../ hooks / storeHooks
import { increment, incrementByAmount } from './counterSlice';


const count = useAppSelector((state) => state.counter.value);

const dispatch = useAppDispatch();


<span> {count}</span>
<button onClick={()=>dispatch(increment())}>Add1 </button>
<button onClick ={()=> dispatch(incrementByAmount(5))}> </button>


import createSlice, createAssynTHunk  from @reducjs/toolkit

export const fetchUsers = createAsyncThunk(
    'users/fetchUsers',
    async (_, thunkApi) => {
        const response = await fetch('url');
        if (!response.ok) {
            throw new Error('Failed TO Fetch')
        } else {
            return await response.json();
        }
    }
)

const userSlice = createSlice({
    name: 'users',
    initialState: { data: [], loading: false, error: null },
    reducers: (state, action) => {

    }
    extraReducers: (builder) => {
        builder
            .addCase(fetchUsers.pending, (state) => {
                state.loading = true
            })
            .addCase(fetchUsers.fullfilleds, (state) => {
                state.loading = false,

                    state.data = action.payload
            })
            .addCase(fetchUsers.failed, (state, action) => {
                state.loading = false,
                    state.error = action.error.meessage
            })
    }
})

export default userSLice;


import fetchUsers .import { useEffect } from "react";
/userSlice 
iport useDispatch, useAppselector

// in component how to use them 
const dispatch = useAppDispatch();
const { data, loading, error } = useAppSelector((state) => state.user) \



    useEffect(() => {
        dispatch(fetchUsers())
    }, [dispatch])


if (loading) return <div>Loading users...</div>;
if (error) return <div>Error: {error}</div>;
