# class Animal():
#     def __init__(self, name):
#         self.name = name 
#     def speak(self):
#         pass


# class Dog(Animal): # inheritance
#     def speak(self):
#         print("Woof")

# my_dog = Dog("Buddy")
# print(my_dog.name)
# my_dog.speak()
# print(my_dog.speak)


# def two_sum(nums , target):
#     for i in range(len(nums)):
#         for j in range(i+1 , len(nums)):
#             if nums[i] + nums[j] == target:
#                 return [i,j]
#     return []




# def two_sum(nums, target):
#     seen = {}  # Dictionary to store: {value: index}
    
#     for i, num in enumerate(nums): 
#         # enumnerate give index and value  both 
#         complement = target - num
        
#         if complement in seen:
#             return [seen[complement], i]
        
#         # Store the current number's index
#         seen[num] = i
        
#     return []  # Return empty if no solution is found

# print(two_sum([2,7,11,15] , 9))



# def is_valid(s : str) -> bool :
#     bracket_map ={
#         "(" : ")",
#         "[" : "]",
#         "{" : "}"
#     }

#     stack =[];


#     for char in s:
#         if char in bracket_map:
#             # If it's an opening bracket, push to stack
#             stack.append(char)
#         else:
#             # If it's a closing bracket
#             if not stack:
#                 return False
            
#             top_element = stack.pop()
            
#             if bracket_map[top_element] != char:
#                 return False
    
#     return not stack

# print(is_valid("()[]{}"))   



# class BankAccount:
#     def __init__(self , balance):
#         self.__balance = balance  #private variable
    
#     @property
#     def balance(self):
#         return self.__balance

#     @balance.setter
#     def balance(self , value):
#         if value < 0 :
#             raise ValueError("Balance cannot be negative")
#         self.__balance = value

# account = BankAccount(1000)
# print(account.balance)
# account.balance = 2000
# print(account.balance)    


# class A:
#     def speak(self):
#         print("A speaking")

# class B(A):
#     def speak(self):
#         print("B speaking")
#         super().speak()

# class C(A):
#     def speak(self):
#         print("C speaking")
#         super().speak()

# class D(B, C):
#     def speak(self):
#         print("D speaking")
#         super().speak()

# # Let's look at the MRO
# # print(D.mro()) 
# # Result: [D, B, C, A, object]

# d = D()
# d.speak()


# class LaserTool:
#     def operate(self):
#         return "cutting with high-intensity laser."

# class GripperTool:
#     def operate(self):
#         return "picking up objects with precision."

# class Robot:
#     def __init__(self, name, tool):
#         self.name = name
#         self.tool = tool  # Composition: The Robot HAS A tool

#     def perform_task(self):
#         print(f"Robot {self.name} is {self.tool.operate()}")

# # Usage
# welder = Robot("Welder-9000", LaserTool())
# packer = Robot("Packer-X", GripperTool())

# welder.perform_task()
# # If we want to upgrade the packer to a laser, we just swap the object:
# packer.tool = LaserTool()
# packer.perform_task()


import heapq
from collections import Counter
from typing import List

def top_k_frequent(nums: List[int], k: int) -> List[int]:
    # 1. Count frequencies - O(N)
    # Counter creates a frequency map: {num: count}
    count_map = Counter(nums)
    print(count_map)
    
    # 2. Use a Heap to find the top K - O(N log K)
    # nlargest is optimized to maintain a heap of size k
    # It returns the keys of the dictionary based on their values (counts)
    return heapq.nlargest(k, count_map.keys(), key=count_map.get)

# Test cases
print(top_k_frequent([1, 1, 1, 2, 2, 3], 2))  # Output: [1, 2]
print(top_k_frequent([4, 4, 4, 4, 1, 2, 2], 1)) # Output: [4]